"use client";

import { useCallback, useState } from "react";
import { parseEther } from "viem";
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
} from "wagmi";
import {
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
} from "@/lib/contracts";

type Phase = "idle" | "approving" | "listing" | "done" | "error";

/**
 * Two-step listing: first approve marketplace on the INFT, then call
 * listItem(tokenId, price). If the marketplace is already approvedForAll, skip
 * the approval step.
 */
export function useListFighter() {
  const { address } = useAccount();
  const approve = useWriteContract();
  const list = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const listReceipt = useWaitForTransactionReceipt({ hash: list.data });

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<Error | null>(null);

  const { data: isApprovedForAll } = useReadContract({
    address: FIGHTER_INFT_ADDRESS as `0x${string}`,
    abi: FIGHTER_INFT_ABI,
    functionName: "isApprovedForAll",
    args: address && MARKETPLACE_ADDRESS
      ? [address, MARKETPLACE_ADDRESS as `0x${string}`]
      : undefined,
    query: { enabled: !!address && !!MARKETPLACE_ADDRESS && !!FIGHTER_INFT_ADDRESS },
  });

  const write = useCallback(
    async ({ tokenId, priceEth }: { tokenId: number; priceEth: string }) => {
      if (!MARKETPLACE_ADDRESS || !FIGHTER_INFT_ADDRESS) {
        throw new Error("Marketplace or Fighter contract not configured");
      }
      setError(null);
      const priceWei = parseEther(priceEth);

      // Step 1: ensure marketplace is approved operator for the whole collection.
      if (!isApprovedForAll) {
        setPhase("approving");
        await approve.writeContractAsync({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          abi: FIGHTER_INFT_ABI,
          functionName: "setApprovalForAll",
          args: [MARKETPLACE_ADDRESS as `0x${string}`, true],
        });
      }

      // Step 2: list on the marketplace.
      setPhase("listing");
      const txHash = await list.writeContractAsync({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
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
