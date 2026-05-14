"use client";

// Per-tokenId MomentMarketplace listing read. Mirrors `useListing` for
// fighters but points at MOMENT_MARKET_ADDRESS / MOMENT_MARKET_ABI.
// Used by moment cards to decide whether to surface a "List for sale"
// button (inactive listing) or a "Listed · X OG" badge.

import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { MOMENT_MARKET_ABI, MOMENT_MARKET_ADDRESS } from "@/lib/contracts";

export interface MomentListingState {
  tokenId: number;
  seller: `0x${string}`;
  priceWei: bigint;
  price: number;
  listedAt: number;
  active: boolean;
}

export function useMomentListing(
  tokenId: number | bigint | null | undefined,
) {
  const id = tokenId == null ? null : BigInt(tokenId);
  const enabled = id !== null && MOMENT_MARKET_ADDRESS !== "";

  const { data, isLoading, error, refetch } = useReadContract({
    address: enabled ? (MOMENT_MARKET_ADDRESS as `0x${string}`) : undefined,
    abi: MOMENT_MARKET_ABI,
    functionName: "getListing",
    args: enabled ? [id] : undefined,
    query: { enabled },
  });

  if (!enabled || !data) {
    return {
      data: null as MomentListingState | null,
      isLoading,
      error,
      refetch,
    } as const;
  }

  // viem decodes struct returns as either positional tuples or named
  // objects depending on ABI shape. Cover both shapes the same way
  // useListing does — `getListing` returns `Listing { tokenId, seller,
  // price, listedAt, active }`.
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
    return {
      data: null as MomentListingState | null,
      isLoading: false,
      error: null,
      refetch,
    } as const;
  }

  const listing: MomentListingState = {
    tokenId: Number(rawId),
    seller,
    priceWei,
    price: Number(formatEther(priceWei)),
    listedAt: Number(listedAtSec) * 1000,
    active,
  };
  return { data: listing, isLoading: false, error: null, refetch } as const;
}
