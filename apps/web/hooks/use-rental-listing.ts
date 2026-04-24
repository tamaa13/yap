"use client";

import { formatEther } from "viem";
import { useReadContracts } from "wagmi";
import { RENTAL_ESCROW_ABI, RENTAL_ESCROW_ADDRESS } from "@/lib/contracts";

export interface RentalListing {
  tokenId: number;
  owner: `0x${string}`;
  pricePerDayWei: bigint;
  pricePerDay: number; // in 0G/day
  maxDurationDays: number;
  listedAt: number; // ms epoch
  active: boolean;
}

export interface ActiveRental {
  renter: `0x${string}`;
  startedAt: number;
  expiresAt: number;
  paid: bigint;
}

export interface RentalState {
  listing: RentalListing | null;
  active: ActiveRental | null;
  effectiveUser: `0x${string}` | null;
}

function decodeListing(raw: unknown, tokenId: bigint): RentalListing | null {
  if (!raw) return null;
  let t: bigint, owner: `0x${string}`, ppd: bigint, maxD: bigint, la: bigint, active: boolean;
  if (Array.isArray(raw)) {
    [t, owner, ppd, maxD, la, active] = raw as [
      bigint,
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      boolean,
    ];
  } else if (raw && typeof raw === "object") {
    const o = raw as {
      tokenId: bigint;
      owner: `0x${string}`;
      pricePerDay: bigint;
      maxDurationDays: bigint;
      listedAt: bigint;
      active: boolean;
    };
    t = o.tokenId;
    owner = o.owner;
    ppd = o.pricePerDay;
    maxD = o.maxDurationDays;
    la = o.listedAt;
    active = o.active;
  } else {
    return null;
  }
  return {
    tokenId: Number(t),
    owner,
    pricePerDayWei: ppd,
    pricePerDay: Number(formatEther(ppd)),
    maxDurationDays: Number(maxD),
    listedAt: Number(la) * 1000,
    active,
  };
}

function decodeRental(raw: unknown): ActiveRental | null {
  if (!raw) return null;
  let renter: `0x${string}`, startedAt: bigint, expiresAt: bigint, paid: bigint;
  if (Array.isArray(raw)) {
    [renter, startedAt, expiresAt, paid] = raw as [
      `0x${string}`,
      bigint,
      bigint,
      bigint,
    ];
  } else if (raw && typeof raw === "object") {
    const o = raw as {
      renter: `0x${string}`;
      startedAt: bigint;
      expiresAt: bigint;
      paid: bigint;
    };
    renter = o.renter;
    startedAt = o.startedAt;
    expiresAt = o.expiresAt;
    paid = o.paid;
  } else {
    return null;
  }
  return {
    renter,
    startedAt: Number(startedAt) * 1000,
    expiresAt: Number(expiresAt) * 1000,
    paid,
  };
}

export function useRentalListing(tokenId: bigint | number | null | undefined) {
  const id = tokenId == null ? null : BigInt(tokenId);
  const enabled = id !== null && RENTAL_ESCROW_ADDRESS !== "";

  const { data, isLoading, error, refetch } = useReadContracts({
    allowFailure: true,
    contracts: enabled
      ? [
          {
            address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
            abi: RENTAL_ESCROW_ABI,
            functionName: "getRentListing",
            args: [id],
          },
          {
            address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
            abi: RENTAL_ESCROW_ABI,
            functionName: "getActiveRental",
            args: [id],
          },
          {
            address: RENTAL_ESCROW_ADDRESS as `0x${string}`,
            abi: RENTAL_ESCROW_ABI,
            functionName: "effectiveUser",
            args: [id],
          },
        ]
      : [],
    query: { enabled },
  });

  if (!enabled || !data || id === null) {
    return { data: null as RentalState | null, isLoading, error, refetch } as const;
  }

  const listingRes = data[0];
  const rentalRes = data[1];
  const userRes = data[2];
  const listing =
    listingRes?.status === "success" ? decodeListing(listingRes.result, id) : null;
  const active =
    rentalRes?.status === "success" ? decodeRental(rentalRes.result) : null;
  const now = Date.now();
  const activeEffective = active && active.expiresAt > now ? active : null;
  const effectiveUser =
    userRes?.status === "success" ? (userRes.result as `0x${string}`) : null;

  return {
    data: {
      listing: listing?.active ? listing : null,
      active: activeEffective,
      effectiveUser,
    } as RentalState,
    isLoading: false,
    error: null,
    refetch,
  } as const;
}
