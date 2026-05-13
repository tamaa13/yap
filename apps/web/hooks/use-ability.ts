"use client";

import { useCallback } from "react";
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  ABILITY_ESCROW_ABI,
  ABILITY_ESCROW_ADDRESS,
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
} from "@/lib/contracts";
import {
  ARCHETYPE_INDEX,
  TRAIT_DIMENSION_BY_INDEX,
  type ScoreDimension,
} from "@/lib/archetype-meta";
import type { FighterArchetype } from "@/lib/types";

const enabledAbility = ABILITY_ESCROW_ADDRESS !== "";

/**
 * Fire `AbilityEscrow.useAbility(battleId, side, round)` from the
 * controlling viewer. One ability per battle, contract-enforced;
 * `isAbilityUsed` returns true after a successful tx and stays true
 * for the battle's lifetime.
 */
export function useUseAbility() {
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });

  const fire = useCallback(
    async (
      battleId: number | bigint,
      side: "a" | "b",
      round: number,
    ) => {
      if (!enabledAbility) {
        throw new Error("AbilityEscrow not configured");
      }
      return write.writeContractAsync({
        address: ABILITY_ESCROW_ADDRESS as `0x${string}`,
        abi: ABILITY_ESCROW_ABI,
        functionName: "useAbility",
        args: [BigInt(battleId), side === "a" ? 0 : 1, round],
      });
    },
    [write],
  );

  return {
    error: write.error,
    isPending: write.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    txHash: write.data,
    fire,
  };
}

/**
 * Read `AbilityEscrow.isAbilityUsed(battleId, side)`. Polls every 6s
 * while the battle is in flight so the UI flips from "Use ability" →
 * "Used" cleanly after a tx confirms on-chain. Same cadence as
 * useBattle's poll for parity.
 */
export function useAbilityUsed(
  battleId: number | bigint | null | undefined,
  side: "a" | "b" | null,
) {
  const enabled =
    enabledAbility && battleId !== null && battleId !== undefined && side !== null;
  const { data, isLoading, error, refetch } = useReadContract({
    address: enabled ? (ABILITY_ESCROW_ADDRESS as `0x${string}`) : undefined,
    abi: ABILITY_ESCROW_ABI,
    functionName: "isAbilityUsed",
    args:
      enabled && side
        ? [BigInt(battleId!), side === "a" ? 0 : 1]
        : undefined,
    query: { enabled, refetchInterval: enabled ? 6_000 : false },
  });
  return {
    used: typeof data === "boolean" ? data : false,
    isLoading: enabled && isLoading,
    error,
    refetch,
  } as const;
}

/**
 * Read `YapFighter.getTraits(tokenId)` — packed 5-tuple of on-chain
 * traits committed at mint time. Returns null while the contract
 * hasn't shipped the function (pre-cascade) or the read is in flight.
 *
 * Maps the raw uint8[5] return into a named `Record<ScoreDimension,
 * number>` so call sites stay archetype-agnostic.
 */
export function useFighterTraits(tokenId: number | bigint | null | undefined) {
  const enabled =
    FIGHTER_INFT_ADDRESS !== "" && tokenId !== null && tokenId !== undefined;
  const { data, isLoading, error, refetch } = useReadContract({
    address: enabled ? (FIGHTER_INFT_ADDRESS as `0x${string}`) : undefined,
    abi: FIGHTER_INFT_ABI,
    functionName: "getTraits",
    args: enabled ? [BigInt(tokenId!)] : undefined,
    query: { enabled },
  });

  if (!enabled || !data) {
    return {
      data: null as Record<ScoreDimension, number> | null,
      isLoading: enabled && isLoading,
      error,
      refetch,
    } as const;
  }
  // Contract returns a fixed-length tuple. viem types it as readonly
  // unknown[] for arbitrary ABI shapes; cast to the known shape here.
  const raw = data as readonly (number | bigint)[];
  const traits: Record<ScoreDimension, number> = {
    logos: 0,
    rhetoric: 0,
    aggression: 0,
    range: 0,
    concreteness: 0,
  };
  for (let i = 0; i < TRAIT_DIMENSION_BY_INDEX.length; i++) {
    const v = raw[i];
    if (v === undefined) continue;
    traits[TRAIT_DIMENSION_BY_INDEX[i]] = Number(v);
  }
  return { data: traits, isLoading: false, error: null, refetch } as const;
}

/** Convert a FighterArchetype string to its uint8 contract id. */
export function archetypeToIndex(arch: FighterArchetype): number {
  return ARCHETYPE_INDEX[arch];
}
