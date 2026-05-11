"use client";

// Memory access log for a fighter INFT. Surfaces PersonaAccessed events
// indexed by tokenId — each entry records when the encrypted persona was
// decrypted for inference (battle round, accessor address, timestamp).
// This is the auditability story: every inference is on-chain, no
// hidden runs. UI lives as a tab on the fighter detail page.
//
// Pre-redeploy graceful: legacy YapFighter without the event emit will
// return an empty list. We never throw — empty array means either
// "no activity yet" or "running pre-redeploy bytecode", both rendered
// as the same friendly empty state on the consumer side.

import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import {
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
} from "@/lib/contracts";

export interface PersonaAccessEntry {
  /** Block timestamp (ms epoch). Pulled from the event arg; we don't
   *  need a per-event block fetch for this — the contract emits the
   *  block timestamp directly. */
  timestamp: number;
  battleId: number;
  accessor: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: number;
  /** Order index within the same block — needed to keep stable ordering
   *  when multiple events land in the same block. */
  logIndex: number;
}

// parseAbiItem variant so viem can index args without us hauling around
// the full FIGHTER_INFT_ABI as a const type assertion.
const PERSONA_ACCESSED_EVENT = parseAbiItem(
  "event PersonaAccessed(uint256 indexed tokenId, address indexed accessor, uint256 indexed battleId, uint64 timestamp)",
);

export function useFighterAccessLog(tokenId: number | null) {
  const client = usePublicClient();
  const [data, setData] = useState<PersonaAccessEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!client || tokenId === null || FIGHTER_INFT_ADDRESS === "") {
      setData([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const logs = await client.getLogs({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          event: PERSONA_ACCESSED_EVENT,
          args: { tokenId: BigInt(tokenId) },
          fromBlock: "earliest",
          toBlock: "latest",
        });
        if (cancelled) return;
        const entries: PersonaAccessEntry[] = logs
          .map((log) => {
            const args = log.args as {
              accessor?: `0x${string}`;
              battleId?: bigint;
              timestamp?: bigint;
            };
            if (
              args.accessor === undefined ||
              args.battleId === undefined ||
              args.timestamp === undefined
            ) {
              return null;
            }
            return {
              timestamp: Number(args.timestamp) * 1000,
              battleId: Number(args.battleId),
              accessor: args.accessor,
              txHash: log.transactionHash,
              blockNumber: Number(log.blockNumber ?? 0),
              logIndex: Number(log.logIndex ?? 0),
            } as PersonaAccessEntry;
          })
          .filter((e): e is PersonaAccessEntry => e !== null)
          // Newest first.
          .sort(
            (a, b) =>
              b.blockNumber - a.blockNumber || b.logIndex - a.logIndex,
          );
        setData(entries);
        setIsLoading(false);
      } catch (e) {
        if (cancelled) return;
        // Pre-redeploy bytecode may revert the topic filter on RPCs that
        // try to verify the event signature against deployed bytecode.
        // Surface as empty list rather than error — the empty state copy
        // covers both meanings.
        setData([]);
        setIsLoading(false);
        setError(e instanceof Error ? e : new Error("failed to load access log"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, tokenId]);

  return { data, isLoading, error } as const;
}

/**
 * Lightweight summary read. Mirrors what the contract's view returns
 * directly without needing the event scan. Useful for tab badges
 * ("Access log · 12") without spinning up the full event fetch.
 */
export function useFighterAccessCount(tokenId: number | null): number {
  const enabled = tokenId !== null && FIGHTER_INFT_ADDRESS !== "";
  const { data } = useReadContract({
    address: enabled ? (FIGHTER_INFT_ADDRESS as `0x${string}`) : undefined,
    abi: FIGHTER_INFT_ABI,
    functionName: "getAccessCount",
    args: enabled ? [BigInt(tokenId as number)] : undefined,
    query: { enabled, refetchInterval: 30_000 },
  });
  if (!data) return 0;
  return Number(data as bigint);
}
