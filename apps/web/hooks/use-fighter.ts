"use client";

import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { adaptFighter, type OnChainFighterCore } from "@/lib/on-chain";
import type { Fighter, FighterArchetype } from "@/lib/types";
import { useFighterStats } from "./use-fighter-stats";
import { useFighterTraits } from "./use-ability";
import { useListing } from "./use-listing";
import { useRentalListing } from "./use-rental-listing";

interface ServerMeta {
  tokenId: number;
  name: string;
  archetype: FighterArchetype | string;
  avatar?: number;
  owner: string;
  mintedAt: number;
  txHash?: string;
  forSale?: boolean;
  price?: number;
  forRent?: boolean;
  rentPrice?: number;
  signatureStyle?: string[];
}

function useServerMeta(tokenId: number | null) {
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  useEffect(() => {
    if (tokenId == null) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/fighters/${tokenId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerMeta | null) => {
        if (!cancelled) setMeta(data);
      })
      .catch(() => {
        if (!cancelled) setMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);
  return meta;
}

export function useFighter(tokenId: bigint | number | null | undefined) {
  const id = tokenId == null ? null : BigInt(tokenId);
  const enabled = id !== null && FIGHTER_INFT_ADDRESS !== "";
  const address = enabled ? (FIGHTER_INFT_ADDRESS as `0x${string}`) : undefined;

  const { data, isLoading, error, refetch } = useReadContracts({
    allowFailure: true,
    contracts: enabled
      ? [
          {
            address,
            abi: FIGHTER_INFT_ABI,
            functionName: "ownerOf",
            args: [id],
          },
          {
            address,
            abi: FIGHTER_INFT_ABI,
            functionName: "metadataHash",
            args: [id],
          },
          {
            address,
            abi: FIGHTER_INFT_ABI,
            functionName: "encryptedURI",
            args: [id],
          },
        ]
      : [],
    query: { enabled },
  });

  const stats = useFighterStats(id);
  const serverMeta = useServerMeta(id == null ? null : Number(id));
  const { data: listing } = useListing(id);
  const { data: rentalState } = useRentalListing(id);
  // 5-trait persona scores committed at mint. Null for legacy fighters
  // (getTraits returns all zeros pre-Phase-4) — `adaptFighter` walks the
  // sum-is-zero branch and surfaces traits: null so the FE can render an
  // "Unscored" badge instead of five empty bars.
  const traitsRead = useFighterTraits(id);

  if (!enabled || !data || data.length === 0 || id === null) {
    return {
      data: null as Fighter | null,
      isLoading: enabled && (isLoading || stats.isLoading),
      error,
      refetch,
    } as const;
  }

  const [ownerResult, hashResult, uriResult] = data;
  if (ownerResult.status !== "success") {
    return {
      data: null as Fighter | null,
      isLoading: false,
      error: ownerResult.error ?? error ?? null,
      refetch,
    } as const;
  }

  const core: OnChainFighterCore = {
    tokenId: id,
    owner: ownerResult.result as `0x${string}`,
    metadataHash:
      hashResult.status === "success"
        ? (hashResult.result as `0x${string}`)
        : "0x0000000000000000000000000000000000000000000000000000000000000000",
    encryptedURI: uriResult.status === "success" ? (uriResult.result as string) : "",
  };

  let fighter = adaptFighter(core, stats.data, traitsRead.data);
  // Overlay server-persisted name/archetype/avatar/listing from
  // /api/fighters/[id]. Contract only stores metadataHash; plaintext lives
  // server-side, and no marketplace contract exists yet so forSale/price
  // also live in the server store.
  if (serverMeta) {
    fighter = {
      ...fighter,
      name: serverMeta.name || fighter.name,
      arch: (serverMeta.archetype as FighterArchetype) || fighter.arch,
      forRent: serverMeta.forRent ?? false,
      rentPrice: serverMeta.rentPrice ?? 0,
      mintTxHash: serverMeta.txHash ?? fighter.mintTxHash,
      style:
        serverMeta.signatureStyle && serverMeta.signatureStyle.length > 0
          ? serverMeta.signatureStyle
          : fighter.style,
    };
  }
  // On-chain Marketplace is authoritative for listing state.
  if (listing) {
    fighter = {
      ...fighter,
      forSale: listing.active,
      price: listing.active ? listing.price : 0,
    };
  }
  // RentalEscrow is authoritative for rental state. A fighter can be in
  // ANY of these states (independently — listing + active are NOT
  // mutually exclusive: a standing for-rent listing covers future
  // re-rentals while a current lease may already be active):
  //   - Listed for rent (rentalState.listing.active === true): swap
  //     display owner back to the original lister, set forRent + rentPrice
  //   - Currently rented (rentalState.active != null): surface the
  //     renter onto Fighter.rentedBy + rentExpiresAt so consumers can
  //     apply iControl semantics
  //   - Neither: clear forRent
  //
  // Previously the listing branch returned early and the active-rental
  // overlay never fired when both were true — fighter 20 (active rental
  // AND standing listing) had rentedBy stuck at null, breaking the
  // arena-pending isDefender gate for the renter.
  if (rentalState) {
    if (rentalState.listing) {
      fighter = {
        ...fighter,
        owner: rentalState.listing.owner,
        forRent: true,
        rentPrice: rentalState.listing.pricePerDay,
      };
    } else {
      fighter = { ...fighter, forRent: false, rentPrice: 0 };
    }
    // Parallel (not exclusive) merge — active-rental overlay always
    // applies when an active lease exists, regardless of listing state.
    if (rentalState.active) {
      fighter = {
        ...fighter,
        rentedBy: rentalState.active.renter,
        rentExpiresAt: Number(rentalState.active.expiresAt),
      };
    }
  }
  return { data: fighter, isLoading: false, error: null, refetch } as const;
}
