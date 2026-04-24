"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/contracts";

/**
 * buyItem(tokenId) payable — pay exact listing price (caller responsible for
 * passing correct value). Marketplace contract handles splitting fee + crediting
 * seller proceeds, then transfers the NFT.
 */
export function useBuyFighter() {
  const buy = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: buy.data });

  const write = useCallback(
    async ({ tokenId, priceWei }: { tokenId: number; priceWei: bigint }) => {
      if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace contract not configured");
      }
      return buy.writeContractAsync({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
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
