"use client";

import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { FIGHTER_INFT_ABI, FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { adaptFighter, type OnChainFighterCore } from "@/lib/on-chain";
import type { Fighter, FighterArchetype } from "@/lib/types";
import { useFighterStats } from "./use-fighter-stats";
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

  let fighter = adaptFighter(core, stats.data);
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
  // RentalEscrow is authoritative for rental state. When listed-for-rent or
  // currently rented, the NFT's on-chain ownerOf is the escrow contract —
  // swap the display owner back to the original lister so the UI shows the
  // effective human owner instead of the custody contract.
  if (rentalState) {
    const rl = rentalState.listing;
    if (rl) {
      fighter = {
        ...fighter,
        owner: rl.owner,
        forRent: true,
        rentPrice: rl.pricePerDay,
      };
    } else if (rentalState.active) {
      // Active rental (listing deactivated, still in escrow custody).
      // Surface the renter onto the Fighter record so consumers downstream
      // (arena-pending isDefender gate, battle/new opponent picker, vault
      // challenges) can apply iControl semantics without needing a separate
      // rental hook. Plural useFighters already does this; the singular
      // useFighter used to drop it, leaving renter-side flows blind.
      fighter = {
        ...fighter,
        forRent: false,
        rentedBy: rentalState.active.renter,
        rentExpiresAt: Number(rentalState.active.expiresAt) * 1000,
      };
    } else {
      fighter = { ...fighter, forRent: false, rentPrice: 0 };
    }
  }
  return { data: fighter, isLoading: false, error: null, refetch } as const;
}
