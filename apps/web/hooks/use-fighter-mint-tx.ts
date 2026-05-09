"use client";

import { useEffect, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { FIGHTER_INFT_ADDRESS } from "@/lib/contracts";

// Event signature must match YapFighter's Minted emission. Indexed tokenId
// lets us filter server-side by topic instead of scanning all events.
const MINTED_EVENT = parseAbiItem(
  "event Minted(uint256 indexed tokenId, address indexed to, bytes32 metadataHash, string encryptedURI)",
);

/**
 * Recover a fighter's mint transaction hash from the on-chain Minted event.
 *
 * Fallback for fighters whose off-chain server meta is missing a stored
 * mintTxHash (legacy mints that bypassed /api/fighters/commit, or mints
 * that hit a transient meta-store error). Single eth_getLogs call,
 * filtered by indexed tokenId. Returns undefined while loading or if
 * the lookup fails.
 *
 * Pass null to skip the query (e.g. when mintTxHash is already known
 * from server meta — no point burning an RPC roundtrip).
 */
export function useFighterMintTx(
  tokenId: number | null,
): {
  mintTxHash: `0x${string}` | undefined;
  isLoading: boolean;
} {
  const publicClient = usePublicClient();
  const [state, setState] = useState<{
    mintTxHash: `0x${string}` | undefined;
    isLoading: boolean;
  }>({ mintTxHash: undefined, isLoading: false });

  useEffect(() => {
    if (
      tokenId == null ||
      tokenId < 0 ||
      !publicClient ||
      FIGHTER_INFT_ADDRESS === ""
    ) {
      setState({ mintTxHash: undefined, isLoading: false });
      return;
    }

    let cancelled = false;
    setState({ mintTxHash: undefined, isLoading: true });

    publicClient
      .getLogs({
        address: FIGHTER_INFT_ADDRESS as Address,
        event: MINTED_EVENT,
        args: { tokenId: BigInt(tokenId) },
        fromBlock: "earliest",
        toBlock: "latest",
      })
      .then((logs) => {
        if (cancelled) return;
        const log = logs[0];
        setState({
          mintTxHash: log?.transactionHash ?? undefined,
          isLoading: false,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ mintTxHash: undefined, isLoading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tokenId, publicClient]);

  return state;
}
