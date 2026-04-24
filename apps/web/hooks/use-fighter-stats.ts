"use client";

import { useReadContract } from "wagmi";
import { BATTLE_REGISTRY_ABI, BATTLE_REGISTRY_ADDRESS } from "@/lib/contracts";
import type { OnChainFighterStats } from "@/lib/on-chain";

const ONEG = 1e18;

const DEFAULT_STATS: OnChainFighterStats = {
  elo: 1200,
  wins: 0,
  losses: 0,
  earnings: 0,
};

export function useFighterStats(tokenId: bigint | number | null | undefined) {
  const enabled =
    tokenId !== null && tokenId !== undefined && BATTLE_REGISTRY_ADDRESS !== "";
  const { data, isLoading, error, refetch } = useReadContract({
    address: enabled ? (BATTLE_REGISTRY_ADDRESS as `0x${string}`) : undefined,
    abi: BATTLE_REGISTRY_ABI,
    functionName: "fighterStats",
    args: tokenId != null ? [BigInt(tokenId)] : undefined,
    query: { enabled },
  });

  if (!enabled || !data) {
    return {
      data: DEFAULT_STATS,
      isLoading: enabled && isLoading,
      error,
      refetch,
    } as const;
  }

  const [elo, wins, losses, earnings] = data as [bigint, bigint, bigint, bigint];
  const stats: OnChainFighterStats = {
    elo: Number(elo),
    wins: Number(wins),
    losses: Number(losses),
    earnings: Number(earnings) / ONEG,
  };
  return { data: stats, isLoading: false, error, refetch } as const;
}
