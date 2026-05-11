"use client";

// Royalty surface for ERC-7857 Battle Moments. Wraps MomentINFT's
// EIP-2981-style royalty config:
//
//   - `getRoyaltyInfo(tokenId)` returns `(minter, royaltyBps)` — used for
//     the "Creator earns N%" badge and to gate the edit affordance
//     (only the recorded minter may mutate).
//   - `royaltyInfo(tokenId, salePrice)` returns `(receiver, royaltyAmount)`
//     — the standard EIP-2981 calc used in the buy-flow breakdown so
//     marketplace settlement math stays consistent with what the contract
//     will actually pay out.
//   - `setRoyalty(tokenId, bps)` write hook for the minter to retune.
//
// Pre-redeploy graceful degrade: the view reverts on contracts that
// don't yet implement the new entrypoint. We swallow the error and
// return null so badges stay hidden until the redeploy lands.

import { useReadContract } from "wagmi";
import { useMutation } from "@tanstack/react-query";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  MOMENT_INFT_ABI,
  MOMENT_INFT_ADDRESS,
} from "@/lib/contracts";

export interface MomentRoyalty {
  minter: `0x${string}`;
  royaltyBps: number;
  /** Convenience — same number expressed as a percent (e.g. 2.5 for 250 bps). */
  royaltyPct: number;
}

/**
 * Read the recorded (minter, royaltyBps) for a Moment. Returns null
 * when the contract isn't configured, the view reverts (pre-redeploy
 * MomentINFT), or the tokenId hasn't been minted.
 */
export function useMomentRoyalty(
  tokenId: number | null,
): { data: MomentRoyalty | null; isLoading: boolean } {
  const enabled = tokenId !== null && MOMENT_INFT_ADDRESS !== "";
  const { data, isLoading } = useReadContract({
    address: enabled ? (MOMENT_INFT_ADDRESS as `0x${string}`) : undefined,
    abi: MOMENT_INFT_ABI,
    functionName: "getRoyaltyInfo",
    args: enabled ? [BigInt(tokenId as number)] : undefined,
    query: { enabled },
  });

  if (!data) return { data: null, isLoading: enabled && isLoading };
  // Solidity returns a tuple; viem decodes to a fixed-length array.
  const tuple = data as unknown as readonly [`0x${string}`, bigint];
  const minter = tuple[0];
  const bps = Number(tuple[1] ?? 0n);
  if (!minter || bps < 0) return { data: null, isLoading: false };
  return {
    data: {
      minter,
      royaltyBps: bps,
      royaltyPct: bps / 100,
    },
    isLoading: false,
  };
}

/**
 * EIP-2981 royaltyInfo at a hypothetical sale price (wei). Returns
 * `(receiver, royaltyAmount)` so the buy-flow breakdown can show the
 * exact amount the marketplace will redirect to the creator at the
 * moment of settlement. Defers the math to the contract — never
 * reimplement royalty arithmetic client-side.
 */
export function useMomentRoyaltyForPrice(
  tokenId: number | null,
  salePriceWei: bigint | null,
): {
  receiver: `0x${string}` | null;
  amountWei: bigint;
  isLoading: boolean;
} {
  const enabled =
    tokenId !== null &&
    salePriceWei !== null &&
    salePriceWei > 0n &&
    MOMENT_INFT_ADDRESS !== "";
  const { data, isLoading } = useReadContract({
    address: enabled ? (MOMENT_INFT_ADDRESS as `0x${string}`) : undefined,
    abi: MOMENT_INFT_ABI,
    functionName: "royaltyInfo",
    args:
      enabled && salePriceWei !== null
        ? [BigInt(tokenId as number), salePriceWei]
        : undefined,
    query: { enabled },
  });
  if (!data) {
    return { receiver: null, amountWei: 0n, isLoading: enabled && isLoading };
  }
  const tuple = data as unknown as readonly [`0x${string}`, bigint];
  return { receiver: tuple[0], amountWei: tuple[1] ?? 0n, isLoading: false };
}

/**
 * setRoyalty write hook. The contract enforces minter-only auth, so
 * the caller must be the recorded minter for the tx to land. UI gates
 * the affordance on the same check via useMomentRoyalty so the user
 * doesn't see an edit button they can't successfully invoke.
 */
export function useSetMomentRoyalty() {
  const { writeContractAsync, isPending: isWriting, data: txHash } =
    useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });
  const mut = useMutation({
    mutationFn: async ({
      tokenId,
      royaltyBps,
    }: {
      tokenId: number;
      royaltyBps: number;
    }) => {
      if (MOMENT_INFT_ADDRESS === "") throw new Error("MomentINFT not configured");
      if (royaltyBps < 0 || royaltyBps > 1000) {
        throw new Error("Royalty must be between 0 and 10% (1000 bps)");
      }
      return writeContractAsync({
        address: MOMENT_INFT_ADDRESS as `0x${string}`,
        abi: MOMENT_INFT_ABI,
        functionName: "setRoyalty",
        args: [BigInt(tokenId), royaltyBps],
      });
    },
  });
  return {
    write: mut.mutateAsync,
    isPending: isWriting,
    isConfirming,
    isError: mut.isError,
    error: mut.error,
  };
}
