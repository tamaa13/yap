"use client";

// Two-step Moment listing — mirrors hooks/use-list-fighter.ts.
// Step 1: ensure the MomentMarketplace is an approved operator on the
//   user's MomentINFT collection (`setApprovalForAll(market, true)`).
//   Skipped when already approved.
// Step 2: call `MomentMarketplace.listItem(tokenId, parseEther(price))`.
//
// MomentMarketplace shares the YapMarketplace bytecode (listItem /
// buyItem / cancelListing surface), only the bound INFT differs.
// MOMENT_MARKET_ABI is the same ABI re-exported under a Moment name
// for callsite clarity.

import { useCallback, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  MOMENT_INFT_ABI,
  MOMENT_INFT_ADDRESS,
  MOMENT_MARKET_ABI,
  MOMENT_MARKET_ADDRESS,
} from "@/lib/contracts";

type Phase = "idle" | "approving" | "listing" | "done" | "error";

export function useListMoment() {
  const { address } = useAccount();
  const approve = useWriteContract();
  const list = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const listReceipt = useWaitForTransactionReceipt({ hash: list.data });

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<Error | null>(null);

  const { data: isApprovedForAll } = useReadContract({
    address: MOMENT_INFT_ADDRESS as `0x${string}`,
    abi: MOMENT_INFT_ABI,
    functionName: "isApprovedForAll",
    args:
      address && MOMENT_MARKET_ADDRESS
        ? [address, MOMENT_MARKET_ADDRESS as `0x${string}`]
        : undefined,
    query: {
      enabled:
        !!address && !!MOMENT_MARKET_ADDRESS && !!MOMENT_INFT_ADDRESS,
    },
  });

  const write = useCallback(
    async ({ tokenId, priceEth }: { tokenId: number; priceEth: string }) => {
      if (!MOMENT_MARKET_ADDRESS || !MOMENT_INFT_ADDRESS) {
        throw new Error(
          "MomentMarketplace or MomentINFT contract not configured",
        );
      }
      setError(null);
      const priceWei = parseEther(priceEth);

      if (!isApprovedForAll) {
        setPhase("approving");
        await approve.writeContractAsync({
          address: MOMENT_INFT_ADDRESS as `0x${string}`,
          abi: MOMENT_INFT_ABI,
          functionName: "setApprovalForAll",
          args: [MOMENT_MARKET_ADDRESS as `0x${string}`, true],
        });
      }

      setPhase("listing");
      const txHash = await list.writeContractAsync({
        address: MOMENT_MARKET_ADDRESS as `0x${string}`,
        abi: MOMENT_MARKET_ABI,
        functionName: "listItem",
        args: [BigInt(tokenId), priceWei],
      });

      setPhase("done");
      return txHash;
    },
    [approve, list, isApprovedForAll],
  );

  return {
    phase,
    error: (error ?? approve.error ?? list.error) as Error | null,
    isPending: approve.isPending || list.isPending,
    isConfirming: approveReceipt.isLoading || listReceipt.isLoading,
    isSuccess: listReceipt.isSuccess,
    txHash: list.data,
    write,
  };
}
