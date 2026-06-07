// GET /api/notifications/stream?address=0x...
//
// Server-Sent Events feed of lifecycle notifications for the connected
// wallet. Replaces the previous client-side wagmi watcher + localStorage
// approach, so notifications are pushed by the server, survive across
// tabs/reloads (server replays the recent history on connect), and don't
// depend on each tab spinning its own RPC poll.
//
// Frame format:
//   - `data: {Notification}\n\n`           — one notification per frame
//   - `: keepalive <ts>\n\n`                — comment lines, ignored by EventSource
//
// The endpoint runs a polling loop bound to the connection lifecycle:
// on disconnect the loop is torn down and the stream closes. No persistent
// server state — each connection runs its own watcher. Acceptable for
// MVP scope (low concurrency); a Redis-pubsub fan-out would be the
// next step if user counts grow.

import { JsonRpcProvider, Contract } from "ethers";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { RPC } from "@/lib/0g/storage";
import {
  createScannerState,
  scanRange,
} from "@/lib/notifications/scanner";

export const runtime = "nodejs";
// SSE connections are long-lived; bypass the default function timeout.
export const maxDuration = 300;

const POLL_MS = 4_000;
const KEEPALIVE_MS = 15_000;
// Roughly the last day of blocks at 0G's ~1.5s block time. Bounds the
// initial replay so a fresh connection doesn't choke on archive scans.
const HISTORY_BLOCKS = 40_000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const addrRaw = searchParams.get("address");
  if (!addrRaw || !/^0x[0-9a-fA-F]{40}$/.test(addrRaw)) {
    return new Response("invalid address", { status: 400 });
  }
  const addr = addrRaw.toLowerCase();
  if (BATTLE_ESCROW_ADDRESS === "") {
    return new Response("escrow not configured", { status: 503 });
  }

  const encoder = new TextEncoder();
  const provider = new JsonRpcProvider(RPC);
  const escrow = new Contract(
    BATTLE_ESCROW_ADDRESS,
    BATTLE_ESCROW_ABI as unknown as string[],
    provider,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const sendComment = (comment: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ${comment}\n\n`));
        } catch {
          closed = true;
        }
      };

      const sendNotif = (json: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${json}\n\n`));
        } catch {
          closed = true;
        }
      };

      sendComment(`connected ${Date.now()}`);

      const state = createScannerState();
      let lastScanned: number;
      try {
        const head = await provider.getBlockNumber();
        const start = Math.max(0, head - HISTORY_BLOCKS);
        const historical = await scanRange(escrow, addr, start, head, state);
        for (const n of historical) {
          if (closed) break;
          sendNotif(JSON.stringify(n));
        }
        lastScanned = head;
      } catch (e) {
        console.error("[notif-stream] history scan err:", e);
        // If the initial scan fails, keep the stream open with current head
        // so the polling loop can still push new events.
        lastScanned = await provider.getBlockNumber().catch(() => 0);
      }

      // Polling loop. Each tick checks the head block; if it advanced,
      // scan the new range and push any matching notifs.
      const pollTimer = setInterval(async () => {
        if (closed) return;
        try {
          const head = await provider.getBlockNumber();
          if (head > lastScanned) {
            const fresh = await scanRange(
              escrow,
              addr,
              lastScanned + 1,
              head,
              state,
            );
            for (const n of fresh) {
              if (closed) break;
              sendNotif(JSON.stringify(n));
            }
            lastScanned = head;
          }
        } catch (e) {
          console.error("[notif-stream] poll err:", e);
        }
      }, POLL_MS);

      const pingTimer = setInterval(() => {
        sendComment(`keepalive ${Date.now()}`);
      }, KEEPALIVE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      // Disable nginx-style intermediary buffering on hosted deploys.
      "x-accel-buffering": "no",
    },
  });
}
