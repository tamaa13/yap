"use client";

import { useEffect, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { MOMENT_INFT_ABI, MOMENT_INFT_ADDRESS } from "@/lib/contracts";

export interface OwnedMoment {
  tokenId: number;
  battleId: number;
  fighterTokenId: number;
  roundNo: number;
  side: 0 | 1;
  provenanceHash: `0x${string}`;
}

interface State {
  data: OwnedMoment[];
  isLoading: boolean;
  error: Error | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

/**
 * List Moment INFTs currently owned by the connected wallet.
 *
 * Strategy: query Transfer events to/from the wallet to learn the set
 * of tokenIds it has ever touched, then verify current ownership via
 * `ownerOf(tokenId)` on a small set. For each still-owned token, fetch
 * `momentOf(tokenId)` to surface battle/round/side context the UI needs.
 *
 * Optimization seam: when Moment volume grows, swap the per-token
 * ownerOf+momentOf calls for a single Multicall3 batch. Acceptable for
 * hackathon scope where each user owns <50 moments.
 */
export function useMyMoments(): State {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [state, setState] = useState<State>({
    data: [],
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!address || !publicClient || MOMENT_INFT_ADDRESS === "") {
      setState({ data: [], isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    (async () => {
      try {
        // Read both directions so we can subtract transfers out from
        // transfers in. Tokens minted to the user count as `from = 0`,
        // which the to-side query already covers.
        const [incoming, outgoing] = await Promise.all([
          publicClient.getLogs({
            address: MOMENT_INFT_ADDRESS as Address,
            event: TRANSFER_EVENT,
            args: { to: address },
            fromBlock: "earliest",
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: MOMENT_INFT_ADDRESS as Address,
            event: TRANSFER_EVENT,
            args: { from: address },
            fromBlock: "earliest",
            toBlock: "latest",
          }),
        ]);

        // Net candidate tokenIds: anything the wallet received that
        // wasn't subsequently transferred out (latest event wins). We
        // trust on-chain ownerOf below so we don't need to be perfect
        // here — this just narrows the set we ownerOf-check.
        const candidates = new Set<bigint>();
        for (const log of incoming) {
          const tokenId = log.args.tokenId;
          if (typeof tokenId === "bigint") candidates.add(tokenId);
        }
        // Don't pre-prune by outgoing — owner may have re-acquired the
        // token after sending it, so we still want to verify each.
        for (const log of outgoing) {
          const tokenId = log.args.tokenId;
          if (typeof tokenId === "bigint") candidates.add(tokenId);
        }

        if (candidates.size === 0) {
          if (!cancelled) {
            setState({ data: [], isLoading: false, error: null });
          }
          return;
        }

        // Verify current ownership + fetch context for each candidate.
        // Two reads per token; keep concurrency bounded so we don't burst
        // the RPC.
        const tokenIds = Array.from(candidates);
        const owned: OwnedMoment[] = [];

        const CHUNK = 8;
        for (let i = 0; i < tokenIds.length; i += CHUNK) {
          const slice = tokenIds.slice(i, i + CHUNK);
          const settled = await Promise.all(
            slice.map(async (tokenId) => {
              try {
                const owner = (await publicClient.readContract({
                  address: MOMENT_INFT_ADDRESS as Address,
                  abi: MOMENT_INFT_ABI,
                  functionName: "ownerOf",
                  args: [tokenId],
                })) as Address;
                if (
                  owner.toLowerCase() !== address.toLowerCase() ||
                  owner.toLowerCase() === ZERO_ADDRESS.toLowerCase()
                ) {
                  return null;
                }
                const meta = (await publicClient.readContract({
                  address: MOMENT_INFT_ADDRESS as Address,
                  abi: MOMENT_INFT_ABI,
                  functionName: "momentOf",
                  args: [tokenId],
                })) as readonly [bigint, bigint, `0x${string}`, number, number];
                const [battleId, fighterTokenId, provenanceHash, roundNo, side] =
                  meta;
                return {
                  tokenId: Number(tokenId),
                  battleId: Number(battleId),
                  fighterTokenId: Number(fighterTokenId),
                  roundNo: Number(roundNo),
                  side: (side === 1 ? 1 : 0) as 0 | 1,
                  provenanceHash,
                };
              } catch {
                // Token may have been burned; ownerOf reverts. Skip.
                return null;
              }
            }),
          );
          for (const m of settled) {
            if (m) owned.push(m);
          }
        }

        if (cancelled) return;
        // Newest first — assume tokenId monotonic from the contract.
        owned.sort((a, b) => b.tokenId - a.tokenId);
        setState({ data: owned, isLoading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          data: [],
          isLoading: false,
          error: e instanceof Error ? e : new Error("failed to load moments"),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  return state;
}

/** Format a battle id for the arena route — same padding the rest of
 *  the app uses (b-{hex} 4 digit min). */
export function battleArenaPath(battleId: number): string {
  return `/arenas/b-${battleId.toString(16).padStart(4, "0")}`;
}
