"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { RENTAL_ESCROW_ABI, RENTAL_ESCROW_ADDRESS } from "@/lib/contracts";

export function useRentFighter() {
  const rent = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: rent.data });

  const write = useCallback(
    async ({
      tokenId,
      durationDays,
      totalWei,
    }: {
      tokenId: number;
      durationDays: number;
      totalWei: bigint;
    }) => {
      if (!RENTAL_ESCROW_ADDRESS) {
        throw new Error("Rental escrow not configured");
      }
      return rent.writeContractAsync({
        address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
        abi: RENTAL_ESCROW_ABI,
        functionName: "rent",
        args: [BigInt(tokenId), BigInt(durationDays)],
        value: totalWei,
      });
    },
    [rent],
  );

  return {
    error: rent.error,
    isPending: rent.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    txHash: rent.data,
    write,
  };
}

// Cancel a rent listing (owner only, no active rental).
export function useCancelRentListing() {
  const cancel = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: cancel.data });

  const write = useCallback(
    async (tokenId: number) => {
      if (!RENTAL_ESCROW_ADDRESS) {
        throw new Error("Rental escrow not configured");
      }
      return cancel.writeContractAsync({
        address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
        abi: RENTAL_ESCROW_ABI,
        functionName: "cancelRentListing",
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
