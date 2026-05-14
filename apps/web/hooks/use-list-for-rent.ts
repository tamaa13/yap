"use client";

import { useCallback, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
  RENTAL_ESCROW_ABI,
  RENTAL_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { useInvalidateOnReceipt } from "./use-invalidate-on-receipt";

type Phase = "idle" | "approving" | "listing" | "done";

/**
 * List a fighter for rent. Custody-based escrow — caller must approve the
 * RentalEscrow operator first, then the contract pulls the NFT into custody.
 */
export function useListForRent() {
  const { address } = useAccount();
  const approve = useWriteContract();
  const list = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const listReceipt = useWaitForTransactionReceipt({ hash: list.data });
  useInvalidateOnReceipt(listReceipt.isSuccess);

  const [phase, setPhase] = useState<Phase>("idle");

  const { data: isApprovedForAll } = useReadContract({
    address: FIGHTER_INFT_ADDRESS as `0x${string}`,
    abi: FIGHTER_INFT_ABI,
    functionName: "isApprovedForAll",
    args:
      address && RENTAL_ESCROW_ADDRESS
        ? [address, RENTAL_ESCROW_ADDRESS as `0x${string}`]
        : undefined,
    query: { enabled: !!address && !!RENTAL_ESCROW_ADDRESS && !!FIGHTER_INFT_ADDRESS },
  });

  const write = useCallback(
    async ({
      tokenId,
      pricePerDayEth,
      maxDurationDays,
      disputable,
    }: {
      tokenId: number;
      pricePerDayEth: string;
      maxDurationDays: number;
      disputable?: boolean;
    }) => {
      if (!RENTAL_ESCROW_ADDRESS || !FIGHTER_INFT_ADDRESS) {
        throw new Error("Rental escrow not configured");
      }
      const priceWei = parseEther(pricePerDayEth);

      if (!isApprovedForAll) {
        setPhase("approving");
        await approve.writeContractAsync({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          abi: FIGHTER_INFT_ABI,
          functionName: "setApprovalForAll",
          args: [RENTAL_ESCROW_ADDRESS as `0x${string}`, true],
        });
      }

      setPhase("listing");
      const tx = await list.writeContractAsync({
        address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
        abi: RENTAL_ESCROW_ABI,
        functionName: disputable ? "listForRentDisputable" : "listForRent",
        args: [BigInt(tokenId), priceWei, BigInt(maxDurationDays)],
      });
      setPhase("done");
      return tx;
    },
    [approve, list, isApprovedForAll],
  );

  return {
    phase,
    error: (approve.error ?? list.error) as Error | null,
    isPending: approve.isPending || list.isPending,
    isConfirming: approveReceipt.isLoading || listReceipt.isLoading,
    isSuccess: listReceipt.isSuccess,
    txHash: list.data,
    write,
  };
}
