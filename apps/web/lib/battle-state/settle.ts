// On-chain settlement of battles after the dispute window.
//
// The runner submits the TEE verdict on-chain (status → Verdict) but CANNOT
// call settle() itself: settle() is only valid after the dispute window
// (DISPUTE_WINDOW, 300s) and the runner's after() budget (maxDuration 300s)
// is already spent running the battle + judging. So settlement is decoupled:
//
//   - markPendingSettle()  — runner records the battleId after submitVerdict.
//   - settleIfReady()      — fired lazily from the state route (after()) and
//                            the start route; settles iff status==Verdict and
//                            the dispute window has elapsed. Idempotent + safe
//                            (settle() is permissionless on-chain post-window).
//   - sweepPendingSettles()— cron backstop drains the pending set.
//
// Without this, battles stay in "Verdict" forever: pari-mutuel pools never
// pay out and Moment minting (requires Settled) stays blocked.

import "server-only";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { Redis } from "@upstash/redis";
import { activeChain } from "@/lib/chains";
import { BATTLE_ESCROW_ADDRESS, BATTLE_ESCROW_ABI } from "@/lib/contracts";

const RPC = activeChain.rpcUrls.default.http[0];
const PENDING_KEY = "battle:pending-settle";
// BattleEscrow.Status enum: Pending=0, Live=1, Verdict=2, Settled=3, Cancelled=4
const STATUS_VERDICT = 2;
const STATUS_SETTLED = 3;

function redis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function relayerEscrow(): Contract {
  const pk = process.env.ZG_RELAYER_KEY;
  if (!pk) throw new Error("ZG_RELAYER_KEY not configured for settlement");
  if (!BATTLE_ESCROW_ADDRESS) throw new Error("BattleEscrow address not configured");
  const wallet = new Wallet(pk, new JsonRpcProvider(RPC));
  return new Contract(
    BATTLE_ESCROW_ADDRESS,
    BATTLE_ESCROW_ABI as unknown as string[],
    wallet,
  );
}

export async function markPendingSettle(battleId: number): Promise<void> {
  const r = redis();
  if (r) await r.sadd(PENDING_KEY, battleId);
}

export interface SettleResult {
  battleId: number;
  settled: boolean;
  reason: string;
  txHash?: string;
}

/**
 * Settle a battle iff its dispute window has elapsed and it is still in the
 * Verdict state. No-ops (cheaply) otherwise. Removes the battle from the
 * pending set once it reaches Settled. Never throws — returns a reason.
 */
export async function settleIfReady(battleId: number): Promise<SettleResult> {
  const r = redis();
  try {
    const escrow = relayerEscrow();
    const b = await escrow.getBattle(battleId);
    const status = Number(b.status);
    if (status === STATUS_SETTLED) {
      if (r) await r.srem(PENDING_KEY, battleId);
      return { battleId, settled: true, reason: "already-settled" };
    }
    if (status !== STATUS_VERDICT) {
      return { battleId, settled: false, reason: `status ${status} not Verdict` };
    }
    const deadlineMs = Number(await escrow.disputeDeadline(battleId)) * 1000;
    if (Date.now() < deadlineMs) {
      const left = Math.ceil((deadlineMs - Date.now()) / 1000);
      return { battleId, settled: false, reason: `dispute window open (${left}s left)` };
    }
    const tx = await escrow.settle(battleId);
    const rcpt = await tx.wait();
    if (r) await r.srem(PENDING_KEY, battleId);
    return { battleId, settled: true, reason: "settled", txHash: rcpt?.hash ?? tx.hash };
  } catch (e) {
    return {
      battleId,
      settled: false,
      reason: `settle error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Cron backstop: attempt settlement for every battle in the pending set. */
export async function sweepPendingSettles(): Promise<SettleResult[]> {
  const r = redis();
  if (!r) return [];
  const ids = (await r.smembers(PENDING_KEY)) as Array<string | number>;
  const out: SettleResult[] = [];
  for (const id of ids) out.push(await settleIfReady(Number(id)));
  return out;
}
