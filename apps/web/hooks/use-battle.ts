"use client";

import { useReadContract } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import {
  adaptBattle,
  parseBattleId,
  type OnChainBattleRaw,
} from "@/lib/on-chain";
import type { Battle } from "@/lib/types";

export function useBattle(uiId: string | null | undefined) {
  const id = uiId ? parseBattleId(uiId) : null;
  const enabled = id !== null && BATTLE_ESCROW_ADDRESS !== "";

  const { data, isLoading, error, refetch } = useReadContract({
    address: enabled ? (BATTLE_ESCROW_ADDRESS as `0x${string}`) : undefined,
    abi: BATTLE_ESCROW_ABI,
    functionName: "getBattle",
    args: id !== null ? [id] : undefined,
    // Poll the battle state so status transitions (Pending → Live →
    // Verdict → Settled) propagate to consumers. Without this, the
    // arena-live-client past-redirect at /arenas/[id] never fires —
    // it watches battle.data.status, which only updated on mount or
    // explicit refetch. 6s is a kind balance: responsive enough for
    // a user watching the bell ring, light enough not to thrash RPC.
    query: { enabled, refetchInterval: enabled ? 6_000 : false },
  });

  if (!enabled || !data || id === null) {
    return {
      data: null as Battle | null,
      isLoading: enabled && isLoading,
      error,
      refetch,
    } as const;
  }

  const raw = data as OnChainBattleRaw;
  const battle = adaptBattle(id, raw);
  return { data: battle, isLoading: false, error, refetch } as const;
}
