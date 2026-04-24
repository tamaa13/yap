"use client";

import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/contracts";

export interface Listing {
  tokenId: number;
  seller: `0x${string}`;
  priceWei: bigint;
  price: number; // 0G (eth units)
  listedAt: number;
  active: boolean;
}

/**
 * Read current listing state for a fighter from the on-chain Marketplace.
 */
export function useListing(tokenId: number | bigint | null | undefined) {
  const id = tokenId == null ? null : BigInt(tokenId);
  const enabled = id !== null && MARKETPLACE_ADDRESS !== "";

  const { data, isLoading, error, refetch } = useReadContract({
    address: enabled ? (MARKETPLACE_ADDRESS as `0x${string}`) : undefined,
    abi: MARKETPLACE_ABI,
    functionName: "getListing",
    args: enabled ? [id] : undefined,
    query: { enabled },
  });

  if (!enabled || !data) {
    return { data: null as Listing | null, isLoading, error, refetch } as const;
  }

  // viem returns a struct as either a named object or a tuple depending on ABI
  // output shape. The contract declares Listing struct → viem gives an object.
  // Fall back to tuple access if positional (older ABIs).
  const raw = data as unknown;
  let rawId: bigint;
  let seller: `0x${string}`;
  let priceWei: bigint;
  let listedAtSec: bigint;
  let active: boolean;
  if (Array.isArray(raw)) {
    [rawId, seller, priceWei, listedAtSec, active] = raw as [
      bigint,
      `0x${string}`,
      bigint,
      bigint,
      boolean,
    ];
  } else if (raw && typeof raw === "object") {
    const obj = raw as {
      tokenId: bigint;
      seller: `0x${string}`;
      price: bigint;
      listedAt: bigint;
      active: boolean;
    };
    rawId = obj.tokenId;
    seller = obj.seller;
    priceWei = obj.price;
    listedAtSec = obj.listedAt;
    active = obj.active;
  } else {
    return { data: null as Listing | null, isLoading: false, error: null, refetch } as const;
  }

  const listing: Listing = {
    tokenId: Number(rawId),
    seller,
    priceWei,
    price: Number(formatEther(priceWei)),
    listedAt: Number(listedAtSec) * 1000,
    active,
  };
  return { data: listing, isLoading: false, error: null, refetch } as const;
}
