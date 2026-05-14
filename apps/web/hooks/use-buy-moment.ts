"use client";

// buyItem(tokenId) payable against the Moment marketplace. Mirrors
// use-buy-fighter but targets MOMENT_MARKET_ADDRESS so the buy modal
// can dispatch without us inventing a parallel marketplace contract.
//
// Marketplace contract handles platform-fee withhold + royalty payout
// (EIP-2981 via MomentINFT.royaltyInfo) + seller credit + ERC-721
// transfer atomically. Caller just needs to pass `value = listing price`.

import { useCallback } from "react";
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  MARKETPLACE_ABI,
  MOMENT_MARKET_ADDRESS,
} from "@/lib/contracts";
import { useInvalidateOnReceipt } from "./use-invalidate-on-receipt";

export function useBuyMoment() {
  const buy = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: buy.data });
  useInvalidateOnReceipt(receipt.isSuccess);

  const write = useCallback(
    async ({ tokenId, priceWei }: { tokenId: number; priceWei: bigint }) => {
      if (!MOMENT_MARKET_ADDRESS) {
        throw new Error("Moment marketplace not configured");
      }
      return buy.writeContractAsync({
        address: MOMENT_MARKET_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "buyItem",
        args: [BigInt(tokenId)],
        value: priceWei,
      });
    },
    [buy],
  );

  return {
    error: buy.error,
    isPending: buy.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    txHash: buy.data,
    write,
  };
}

/**
 * Marketplace platform fee in bps. Polled lightly so the buy modal's
 * breakdown reflects the live fee schedule (admin can retune via
 * setPlatformFee). Defaults to 0 while loading — the modal hides the
 * fee row when the value is 0 to avoid showing a misleading zero
 * before the read lands.
 */
export function useMomentMarketFeeBps(): number {
  const { data } = useReadContract({
    address:
      MOMENT_MARKET_ADDRESS !== ""
        ? (MOMENT_MARKET_ADDRESS as `0x${string}`)
        : undefined,
    abi: MARKETPLACE_ABI,
    functionName: "platformFeeBps",
    query: {
      enabled: MOMENT_MARKET_ADDRESS !== "",
      refetchInterval: 60_000,
    },
  });
  if (!data) return 0;
  return Number(data as bigint);
}
