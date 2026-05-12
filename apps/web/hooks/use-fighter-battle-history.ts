"use client";

// Battle history for a single fighter, read from BattleRegistry.battleHistory.
// One RPC call per render — limit set high enough to cover any reasonable
// fighter career (50 should be plenty pre-demo). If history outgrows that
// we can add pagination, but the table itself doesn't paginate today.

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import {
  BATTLE_REGISTRY_ABI,
  BATTLE_REGISTRY_ADDRESS,
} from "@/lib/contracts";
import type { Battle, BattleStatus } from "@/lib/types";

const HISTORY_LIMIT = 50n;

interface OnChainHistoryEntry {
  battleId: bigint;
  fighterA: bigint;
  fighterB: bigint;
  topic: string;
  startTime: bigint;
  endTime: bigint;
  winner: number; // 0=A, 1=B, 2=draw
  finalized: boolean;
}

export function useFighterBattleHistory(
  tokenId: bigint | number | null | undefined,
) {
  const enabled =
    tokenId !== null &&
    tokenId !== undefined &&
    BATTLE_REGISTRY_ADDRESS !== "";

  const { data, isLoading, error, refetch } = useReadContract({
    address: enabled ? (BATTLE_REGISTRY_ADDRESS as `0x${string}`) : undefined,
    abi: BATTLE_REGISTRY_ABI,
    functionName: "battleHistory",
    args: tokenId != null ? [BigInt(tokenId), 0n, HISTORY_LIMIT] : undefined,
    query: { enabled, refetchInterval: enabled ? 30_000 : false },
  });

  const battles = useMemo<Battle[]>(() => {
    if (!data) return [];
    const entries = data as OnChainHistoryEntry[];
    return entries
      .map((entry) => mapEntryToBattle(entry))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  }, [data]);

  return {
    data: battles,
    isLoading: enabled && isLoading,
    error,
    refetch,
  } as const;
}

function mapEntryToBattle(entry: OnChainHistoryEntry): Battle {
  const finalized = entry.finalized;
  const status: BattleStatus = finalized ? "past" : "live";
  const winner = finalized
    ? entry.winner === 0
      ? "a"
      : entry.winner === 1
        ? "b"
        : undefined
    : undefined;
  return {
    id: `b-${entry.battleId.toString(16).padStart(4, "0")}`,
    status,
    round: 0,
    maxRound: 0,
    topic: entry.topic,
    a: Number(entry.fighterA),
    b: Number(entry.fighterB),
    pool: 0,
    spectators: 0,
    endsIn: null,
    startedAt:
      entry.startTime > 0n ? Number(entry.startTime) * 1000 : null,
    oddsA: 1,
    oddsB: 1,
    winner,
    endedAt:
      entry.endTime > 0n ? Number(entry.endTime) * 1000 : undefined,
  };
}
