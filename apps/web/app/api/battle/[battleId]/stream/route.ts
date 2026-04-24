// GET /api/battle/[battleId]/stream
//
// Server-Sent Events endpoint. Any number of spectators can attach; each
// receives:
//   1. An initial `snapshot` frame with the current BattleState
//   2. All subsequent `BattleEvent`s published by the runner
//
// Disconnects cleanly when the client navigates away or aborts the fetch.
// Periodic keep-alive pings prevent intermediary proxies from timing out
// the connection during long quiet periods (e.g., between rounds).

import { getBattleStore } from "@/lib/battle-state/store";
import type { BattleEvent } from "@/lib/battle-state/types";

export const runtime = "nodejs";
// SSE connections are long-lived; bypass Vercel's default body timeout.
export const maxDuration = 3600;

const KEEPALIVE_MS = 15_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ battleId: string }> },
) {
  const { battleId: raw } = await params;
  const battleId = Number(raw);
  if (!Number.isFinite(battleId) || battleId <= 0) {
    return new Response("invalid battleId", { status: 400 });
  }

  const store = getBattleStore();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BattleEvent) => {
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller closed — peer disconnected.
        }
      };

      // 0. Immediate keep-alive frame so clients + intermediaries see the
      //    stream is alive even before any battle events arrive.
      controller.enqueue(encoder.encode(`: connected ${Date.now()}\n\n`));

      // 1. Send initial snapshot if state exists.
      const initial = await store.get(battleId);
      if (initial) {
        send({ type: "snapshot", state: initial });
      }

      // 2. Subscribe to future events.
      const unsubscribe = store.subscribe(battleId, send);

      // 3. After subscribing, publish a spectator-count event so every
      //    client (including this new one) sees the updated tally.
      store.publish(battleId, {
        type: "spectators",
        count: store.subscriberCount(battleId),
      });

      // 4. Keep-alive pings. SSE comments (lines starting with `:`) are
      //    legal per the EventSource spec and never surface as events.
      const pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          /* closed */
        }
      }, KEEPALIVE_MS);

      // 5. Clean up on client disconnect. Also publish an updated
      //    spectator-count event so remaining clients see the drop.
      const onAbort = () => {
        clearInterval(pingTimer);
        unsubscribe();
        // Publish AFTER unsubscribe so count reflects the departure.
        store.publish(battleId, {
          type: "spectators",
          count: store.subscriberCount(battleId),
        });
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      // Stream was closed by the consumer (e.g., page navigation).
      // Subscription cleanup already handled by the abort listener above.
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // disable nginx proxy buffering if upstream
    },
  });
}
