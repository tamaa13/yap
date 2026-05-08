"use client";

import { useCallback, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { RENTAL_ESCROW_ABI, RENTAL_ESCROW_ADDRESS } from "@/lib/contracts";

type Action =
  | "acceptRental"
  | "disputeRental"
  | "claimRentalTimeout"
  | "proposeRentalSplit"
  | "forceCloseRental";

/**
 * Encapsulates the five anima-style dispute lifecycle actions on
 * RentalEscrow. Each action is a single contract write; the hook
 * tracks which one is in flight so the UI can disable the right
 * button. Settlement state is read separately via `useRentalListing`,
 * which the caller is expected to refetch on success.
 */
export function useRentalDispute() {
  const { writeContractAsync, data: hash, isPending, error, reset } =
    useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [pendingAction, setPendingAction] = useState<Action | null>(null);

  const accept = useCallback(
    async (tokenId: bigint) => {
      if (!RENTAL_ESCROW_ADDRESS) throw new Error("Rental escrow not configured");
      setPendingAction("acceptRental");
      try {
        return await writeContractAsync({
          address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
          abi: RENTAL_ESCROW_ABI,
          functionName: "acceptRental",
          args: [tokenId],
        });
      } finally {
        setPendingAction(null);
      }
    },
    [writeContractAsync],
  );

  const dispute = useCallback(
    async (tokenId: bigint) => {
      if (!RENTAL_ESCROW_ADDRESS) throw new Error("Rental escrow not configured");
      setPendingAction("disputeRental");
      try {
        return await writeContractAsync({
          address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
          abi: RENTAL_ESCROW_ABI,
          functionName: "disputeRental",
          args: [tokenId],
        });
      } finally {
        setPendingAction(null);
      }
    },
    [writeContractAsync],
  );

  const claimTimeout = useCallback(
    async (tokenId: bigint) => {
      if (!RENTAL_ESCROW_ADDRESS) throw new Error("Rental escrow not configured");
      setPendingAction("claimRentalTimeout");
      try {
        return await writeContractAsync({
          address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
          abi: RENTAL_ESCROW_ABI,
          functionName: "claimRentalTimeout",
          args: [tokenId],
        });
      } finally {
        setPendingAction(null);
      }
    },
    [writeContractAsync],
  );

  const proposeSplit = useCallback(
    async (tokenId: bigint, renterAmount: bigint, ownerAmount: bigint) => {
      if (!RENTAL_ESCROW_ADDRESS) throw new Error("Rental escrow not configured");
      setPendingAction("proposeRentalSplit");
      try {
        return await writeContractAsync({
          address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
          abi: RENTAL_ESCROW_ABI,
          functionName: "proposeRentalSplit",
          args: [tokenId, renterAmount, ownerAmount],
        });
      } finally {
        setPendingAction(null);
      }
    },
    [writeContractAsync],
  );

  const forceClose = useCallback(
    async (tokenId: bigint) => {
      if (!RENTAL_ESCROW_ADDRESS) throw new Error("Rental escrow not configured");
      setPendingAction("forceCloseRental");
      try {
        return await writeContractAsync({
          address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
          abi: RENTAL_ESCROW_ABI,
          functionName: "forceCloseRental",
          args: [tokenId],
        });
      } finally {
        setPendingAction(null);
      }
    },
    [writeContractAsync],
  );

  return {
    accept,
    dispute,
    claimTimeout,
    proposeSplit,
    forceClose,
    pendingAction,
    txHash: hash,
    isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: error as Error | null,
    reset,
  };
}
