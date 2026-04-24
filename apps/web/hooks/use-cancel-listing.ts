"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/contracts";

export function useCancelListing() {
  const cancel = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: cancel.data });

  const write = useCallback(
    async (tokenId: number) => {
      if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace contract not configured");
      }
      return cancel.writeContractAsync({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "cancelListing",
        args: [BigInt(tokenId)],
      });
    },
    [cancel],
  );

  return {
    error: cancel.error,
    isPending: cancel.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    txHash: cancel.data,
    write,
  };
}
