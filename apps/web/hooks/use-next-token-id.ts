"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";

/**
 * Predict the tokenId the next `YapFighter.mint` call will land at.
 *
 * The contract doesn't expose `_nextTokenId()` / `totalSupply()` as a
 * view function, so we infer the counter by scanning all historical
 * `Minted` events and adding 1 to the highest observed tokenId. Empty
 * contract (fresh deploy) → `1` (standard ERC-721 1-indexed start).
 *
 * Race semantics: the prediction is only safe for a brief window
 * before submitting the mint tx. If another user mints between this
 * read and the local user's mint, our local user's tokenId shifts
 * up by one and any score attestation bound to the earlier prediction
 * will fail `recordMintScores` verification (canonical text includes
 * the tokenId). Callers should refetch right before submitting the
 * mint tx and re-score if the prediction drifted.
 *
 * For hackathon scale this is acceptable — concurrent-mint contention
 * is unlikely on a fresh mainnet. Post-launch, replace this with a
 * contract upgrade exposing `_nextTokenId()` directly.
 */
export function useNextTokenId(): {
  data: number | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = usePublicClient();
  const [data, setData] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!client || FIGHTER_INFT_ADDRESS === "") {
      setData(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          abi: FIGHTER_INFT_ABI,
          eventName: "Minted",
          fromBlock: 0n,
          toBlock: "latest",
        });
        let maxId = 0n;
        for (const log of logs) {
          const args = (log as unknown as { args: { tokenId?: bigint } }).args;
          if (args.tokenId !== undefined && args.tokenId > maxId) {
            maxId = args.tokenId;
          }
        }
        if (!cancelled) {
          // Fresh contract → no Minted events → predict 1. Subsequent
          // mints increment from the highest observed id.
          setData(Number(maxId + 1n));
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, nonce]);

  return {
    data,
    isLoading,
    refetch: () => setNonce((n) => n + 1),
  };
}
