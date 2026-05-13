// Server-side helper: walk BattleEscrow logs for a block range and emit
// Notification objects relevant to one address. Used by the
// /api/notifications/stream SSE endpoint for both the initial historical
// replay and the polling loop that pushes new events.
//
// Strategy
//
// `caredBattleIds` is a set of battles the user has skin in (either as
// creator or as a bettor). We compute it incrementally — each scan range
// extends the set with newly-discovered created/bet events. Subsequent
// per-battle events (Accepted/Declined/Cancelled/VerdictSubmitted/
// BattleSettled) only emit notifications when their battleId is in the
// cared set, so spectators don't get spammed about unrelated battles.
//
// `BattleCreated.creator` is NOT indexed in the contract, so we have to
// query all events in the range and filter client-side. The other
// address-bearing events (BetPlaced.bettor, BattleAccepted.defender,
// PayoutClaimed.bettor) are indexed and we use topic filters directly.

import "server-only";
import { Contract, type Provider } from "ethers";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import type { Notification } from "./types";

const PADDED = (n: number): string => n.toString(16).padStart(4, "0");

export interface ScannerState {
  caredBattleIds: Set<number>;
  /** Cache of block.timestamp (seconds) keyed by blockNumber so a polling
   *  loop doesn't refetch the same block over and over. */
  blockTimestampCache: Map<number, number>;
}

export function createScannerState(): ScannerState {
  return {
    caredBattleIds: new Set<number>(),
    blockTimestampCache: new Map<number, number>(),
  };
}

interface AnyLog {
  transactionHash: string;
  blockNumber: number;
  args?: Record<string, unknown>;
}

async function blockTimeMs(
  provider: Provider,
  cache: Map<number, number>,
  blockNumber: number,
): Promise<number> {
  const cached = cache.get(blockNumber);
  if (cached != null) return cached * 1000;
  const block = await provider.getBlock(blockNumber);
  const ts = block?.timestamp ?? Math.floor(Date.now() / 1000);
  cache.set(blockNumber, ts);
  return ts * 1000;
}

/**
 * Walk `[fromBlock, toBlock]` of BattleEscrow logs and emit notifications
 * relevant to {addr}. Mutates {state.caredBattleIds} as new caring events
 * are seen. Returns notifications sorted oldest-first so SSE clients can
 * append in order.
 */
export async function scanRange(
  escrow: Contract,
  addr: string,
  fromBlock: number,
  toBlock: number,
  state: ScannerState,
): Promise<Notification[]> {
  if (toBlock < fromBlock) return [];
  const lower = addr.toLowerCase();
  const provider = escrow.runner?.provider;
  if (!provider) throw new Error("contract has no provider");

  const out: Notification[] = [];

  // ─── Step 1: extend caredBattleIds via creator + bettor lookups ────
  const createdLogs = (await escrow.queryFilter(
    escrow.filters.BattleCreated(),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  const createdRelevant: AnyLog[] = [];

  // Defender-side resolution: BattleCreated.fighterB carries the
  // defender's tokenId, not their address, and `creator` is only
  // indexed on side A. To notify the defender we lazily build a
  // YapFighter contract handle and call ownerOf(fighterB) for each
  // created event in the window. Address mismatches are silently
  // skipped — the defender just won't see a notif for someone
  // else's battle, which is the correct outcome.
  const fighter =
    FIGHTER_INFT_ADDRESS !== ""
      ? new Contract(
          FIGHTER_INFT_ADDRESS,
          FIGHTER_INFT_ABI as unknown as string[],
          provider,
        )
      : null;

  for (const log of createdLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    if (!battleId) continue;
    const creator = String(args.creator ?? "").toLowerCase();
    const fighterB = args.fighterB as bigint | number | undefined;

    // Challenger side — same as before.
    if (creator === lower) {
      state.caredBattleIds.add(battleId);
      createdRelevant.push(log);
    }

    // Defender side — emit "you've been challenged" notif if the
    // user owns fighterB at the time we read the chain. ownerOf
    // failures (token doesn't exist, RPC blip) are non-fatal —
    // skip the log rather than fail the whole scan.
    if (fighter && fighterB !== undefined && creator !== lower) {
      let defender: string | null = null;
      try {
        defender = String(await fighter.ownerOf(fighterB)).toLowerCase();
      } catch {
        defender = null;
      }
      if (defender === lower) {
        state.caredBattleIds.add(battleId);
        const ts = await blockTimeMs(
          provider,
          state.blockTimestampCache,
          log.blockNumber,
        );
        const creatorShort = creator
          ? `${creator.slice(0, 6)}…${creator.slice(-4)}`
          : "challenger";
        out.push({
          id: `challenge_incoming:${battleId}:${log.transactionHash}`,
          kind: "challenge_incoming",
          battleId,
          message: `Battle #${battleId} — you've been challenged`,
          detail: `${creatorShort} wants to fight your fighter. Accept within 24h or the challenge auto-cancels.`,
          href: `/arenas/b-${PADDED(battleId)}`,
          ts,
        });
      }
    }
  }

  // BetPlaced has indexed bettor — filter via topic.
  const betLogs = (await escrow.queryFilter(
    escrow.filters.BetPlaced(null, addr),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  for (const log of betLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    if (battleId) state.caredBattleIds.add(battleId);
  }

  // ─── Step 2: emit notifications for cared battles ──────────────────
  // BattleAccepted — defender indexed; care if user is defender OR battle
  // is already cared (challenger gets the "your battle was accepted" notif).
  const acceptedLogs = (await escrow.queryFilter(
    escrow.filters.BattleAccepted(),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  for (const log of acceptedLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    const defender = String(args.defender ?? "").toLowerCase();
    if (defender === lower) state.caredBattleIds.add(battleId);
    if (!state.caredBattleIds.has(battleId)) continue;
    const ts = await blockTimeMs(provider, state.blockTimestampCache, log.blockNumber);
    out.push({
      id: `challenge_accepted:${battleId}:${log.transactionHash}`,
      kind: "challenge_accepted",
      battleId,
      message: `Battle #${battleId} accepted`,
      detail: "Defender matched your stake — runner can start now",
      href: `/arenas/b-${PADDED(battleId)}`,
      ts,
    });
  }

  // BattleDeclined — defender indexed.
  const declinedLogs = (await escrow.queryFilter(
    escrow.filters.BattleDeclined(),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  for (const log of declinedLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    if (!state.caredBattleIds.has(battleId)) continue;
    const ts = await blockTimeMs(provider, state.blockTimestampCache, log.blockNumber);
    out.push({
      id: `challenge_declined:${battleId}:${log.transactionHash}`,
      kind: "challenge_declined",
      battleId,
      message: `Battle #${battleId} declined`,
      detail: "Defender refused — your stake will be refunded on cancel",
      href: `/arenas/b-${PADDED(battleId)}`,
      ts,
    });
  }

  // BattleCancelled — only battleId, filter via cared set.
  const cancelledLogs = (await escrow.queryFilter(
    escrow.filters.BattleCancelled(),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  for (const log of cancelledLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    if (!state.caredBattleIds.has(battleId)) continue;
    const ts = await blockTimeMs(provider, state.blockTimestampCache, log.blockNumber);
    out.push({
      id: `challenge_cancelled:${battleId}:${log.transactionHash}`,
      kind: "challenge_cancelled",
      battleId,
      message: `Battle #${battleId} cancelled`,
      detail: "Stakes refundable via claimPayout",
      href: `/arenas/b-${PADDED(battleId)}`,
      ts,
    });
  }

  // VerdictSubmitted — only battleId, filter via cared set.
  const verdictLogs = (await escrow.queryFilter(
    escrow.filters.VerdictSubmitted(),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  for (const log of verdictLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    if (!state.caredBattleIds.has(battleId)) continue;
    const winner = Number(args.winner ?? 0);
    const sideLabel = winner === 0 ? "A" : winner === 1 ? "B" : "Draw";
    const ts = await blockTimeMs(provider, state.blockTimestampCache, log.blockNumber);
    out.push({
      id: `verdict_submitted:${battleId}:${log.transactionHash}`,
      kind: "verdict_submitted",
      battleId,
      message: `Verdict in for battle #${battleId}`,
      detail: `Winner: ${sideLabel} — dispute window now active`,
      href: `/arenas/b-${PADDED(battleId)}/result`,
      ts,
    });
  }

  // BattleSettled — only battleId, filter via cared set.
  const settledLogs = (await escrow.queryFilter(
    escrow.filters.BattleSettled(),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  for (const log of settledLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    if (!state.caredBattleIds.has(battleId)) continue;
    const winner = Number(args.winner ?? 0);
    const sideLabel = winner === 0 ? "A" : winner === 1 ? "B" : "Draw";
    const ts = await blockTimeMs(provider, state.blockTimestampCache, log.blockNumber);
    out.push({
      id: `battle_settled:${battleId}:${log.transactionHash}`,
      kind: "battle_settled",
      battleId,
      message: `Battle #${battleId} settled (${sideLabel})`,
      detail: "Eligible bettors can claim payout",
      href: `/arenas/b-${PADDED(battleId)}/result`,
      ts,
    });
  }

  // PayoutClaimed — bettor indexed; user-direct, no cared-set check needed.
  const payoutLogs = (await escrow.queryFilter(
    escrow.filters.PayoutClaimed(null, addr),
    fromBlock,
    toBlock,
  )) as unknown as AnyLog[];
  for (const log of payoutLogs) {
    const args = log.args;
    if (!args) continue;
    const battleId = Number(args.battleId ?? 0);
    const amount = args.amount as bigint | undefined;
    const ogAmount = amount != null ? (Number(amount) / 1e18).toFixed(4) : "?";
    const ts = await blockTimeMs(provider, state.blockTimestampCache, log.blockNumber);
    out.push({
      id: `payout_claimed:${battleId}:${log.transactionHash}`,
      kind: "payout_claimed",
      battleId,
      message: `Payout claimed (${ogAmount} 0G)`,
      detail: `From battle #${battleId}`,
      href: `/arenas/b-${PADDED(battleId)}/result`,
      ts,
    });
  }

  // Sort oldest-first so the client appends in chronological order. Stable
  // tie-break on tx hash so ids stay deterministic across replays.
  out.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  return out;
}
