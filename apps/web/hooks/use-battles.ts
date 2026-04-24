"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import {
  adaptBattle,
  type OnChainBattleRaw,
} from "@/lib/on-chain";
import type { Battle, BattleStatus } from "@/lib/types";

interface UseBattlesArgs {
  status?: BattleStatus;
  limit?: number;
}

// Iterate `nextBattleId` down and read each battle. Small N for testnet; swap
// to event-based pagination once volume warrants it.
export function useBattles({ status, limit = 48 }: UseBattlesArgs = {}) {
  const enabled = BATTLE_ESCROW_ADDRESS !== "";

  const next = useReadContract({
    address: enabled ? (BATTLE_ESCROW_ADDRESS as `0x${string}`) : undefined,
    abi: BATTLE_ESCROW_ABI,
    functionName: "nextBattleId",
    query: { enabled },
  });

  const count = next.data ? Number(next.data as bigint) : 0;
  const start = Math.max(1, count - limit + 1);
  const ids = useMemo(() => {
    const arr: bigint[] = [];
    for (let i = count; i >= start; i--) arr.push(BigInt(i));
    return arr;
  }, [count, start]);

  const reads = useReadContracts({
    allowFailure: true,
    contracts: ids.map((id) => ({
      address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
      abi: BATTLE_ESCROW_ABI,
      functionName: "getBattle",
      args: [id],
    })),
    query: { enabled: enabled && ids.length > 0 },
  });

  const battles: Battle[] = [];
  if (reads.data) {
    reads.data.forEach((row, i) => {
      if (row.status !== "success") return;
      const battle = adaptBattle(ids[i], row.result as OnChainBattleRaw);
      if (!status || battle.status === status) battles.push(battle);
    });
  }

  return {
    data: battles,
    isLoading: next.isLoading || reads.isLoading,
    error: next.error ?? reads.error ?? null,
    refetch: reads.refetch,
  } as const;
}
