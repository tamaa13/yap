"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import {
  BATTLE_REGISTRY_ABI,
  BATTLE_REGISTRY_ADDRESS,
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  RENTAL_ESCROW_ABI,
  RENTAL_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { adaptFighter, type OnChainFighterStats } from "@/lib/on-chain";
import type { Fighter, FighterArchetype } from "@/lib/types";

const ONEG = 1e18;

interface ServerMeta {
  tokenId: number;
  name: string;
  archetype: FighterArchetype | string;
  avatar?: number;
  owner: string;
  forSale?: boolean;
  price?: number;
  forRent?: boolean;
  rentPrice?: number;
}

function useServerMetaMap(owner?: string) {
  const [map, setMap] = useState<Record<string, ServerMeta>>({});
  useEffect(() => {
    let cancelled = false;
    const qs = owner ? `?owner=${owner}` : "";
    fetch(`/api/fighters${qs}`)
      .then((r) => (r.ok ? r.json() : { fighters: [] }))
      .then((data: { fighters: ServerMeta[] }) => {
        if (cancelled) return;
        const next: Record<string, ServerMeta> = {};
        for (const m of data.fighters ?? []) {
          next[String(m.tokenId)] = m;
        }
        setMap(next);
      })
      .catch(() => {
        if (!cancelled) setMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);
  return map;
}

interface UseFightersArgs {
  owner?: `0x${string}`;
  limit?: number;
}

// Discover fighters via Transfer(from=0, ...) events, optionally narrowed by
// current owner. Returns [] when contracts aren't deployed yet so screens can
// render their empty state.
export function useFighters({ owner, limit = 64 }: UseFightersArgs = {}) {
  const client = usePublicClient();
  const [tokenIds, setTokenIds] = useState<bigint[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<Error | null>(null);

  useEffect(() => {
    if (!client || FIGHTER_INFT_ADDRESS === "") {
      setTokenIds([]);
      setEventsLoading(false);
      return;
    }

    let cancelled = false;
    setEventsLoading(true);
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: FIGHTER_INFT_ADDRESS as `0x${string}`,
          abi: FIGHTER_INFT_ABI,
          eventName: "Transfer",
          fromBlock: 0n,
          toBlock: "latest",
        });

        // Track latest owner per tokenId from the full Transfer sequence.
        const currentOwner = new Map<string, string>();
        for (const log of logs) {
          const args = (log as unknown as { args: { tokenId?: bigint; to?: string } }).args;
          if (args.tokenId === undefined || args.to === undefined) continue;
          currentOwner.set(args.tokenId.toString(), args.to.toLowerCase());
        }

        // Load all known tokenIds here; apply the `owner` filter after we
        // know the effective owner (rental listing.owner overrides chain
        // ownerOf when a fighter is in rental escrow).
        const all: bigint[] = [];
        for (const idStr of currentOwner.keys()) {
          all.push(BigInt(idStr));
        }
        all.sort((a, b) => Number(a - b));

        if (!cancelled) {
          setTokenIds(all);
          setEventsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setEventsError(e instanceof Error ? e : new Error("events fetch failed"));
          setEventsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, owner, limit]);

  const coreContracts = tokenIds.flatMap((id) => [
    {
      address: FIGHTER_INFT_ADDRESS as `0x${string}`,
      abi: FIGHTER_INFT_ABI,
      functionName: "ownerOf",
      args: [id],
    },
    {
      address: FIGHTER_INFT_ADDRESS as `0x${string}`,
      abi: FIGHTER_INFT_ABI,
      functionName: "metadataHash",
      args: [id],
    },
    {
      address: FIGHTER_INFT_ADDRESS as `0x${string}`,
      abi: FIGHTER_INFT_ABI,
      functionName: "encryptedURI",
      args: [id],
    },
    {
      address: BATTLE_REGISTRY_ADDRESS as `0x${string}`,
      abi: BATTLE_REGISTRY_ABI,
      functionName: "fighterStats",
      args: [id],
    },
  ]);

  const { data, isLoading: readsLoading, error, refetch } = useReadContracts({
    allowFailure: true,
    contracts: coreContracts,
    query: { enabled: tokenIds.length > 0 && BATTLE_REGISTRY_ADDRESS !== "" },
  });

  // Batch-read Marketplace.getListing for every fighter. Returns the on-chain
  // listing state (active flag + price). Runs in parallel with the core reads.
  const listingReadsEnabled = tokenIds.length > 0 && MARKETPLACE_ADDRESS !== "";
  const { data: listingData } = useReadContracts({
    allowFailure: true,
    contracts: listingReadsEnabled
      ? tokenIds.map((id) => ({
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: "getListing",
          args: [id],
        }))
      : [],
    query: { enabled: listingReadsEnabled },
  });

  // Batch-read RentalEscrow listings for every fighter. 2 reads per token:
  // getRentListing + getActiveRental.
  const rentalReadsEnabled = tokenIds.length > 0 && RENTAL_ESCROW_ADDRESS !== "";
  const { data: rentalData } = useReadContracts({
    allowFailure: true,
    contracts: rentalReadsEnabled
      ? tokenIds.flatMap((id) => [
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
        ])
      : [],
    query: { enabled: rentalReadsEnabled },
  });

  // Server-persisted plaintext meta (name/archetype/avatar). Empty when the
  // /api/fighters store hasn't been seeded — fighter cards then fall back to
  // synthesized defaults from the on-chain adapter.
  const metaMap = useServerMetaMap(owner?.toLowerCase());

  const fighters: Fighter[] = [];
  if (data) {
    for (let i = 0; i < tokenIds.length; i++) {
      const [ownerRes, hashRes, uriRes, statsRes] = data.slice(i * 4, i * 4 + 4);
      if (ownerRes.status !== "success") continue;
      const stats: OnChainFighterStats = { elo: 1200, wins: 0, losses: 0, earnings: 0 };
      if (statsRes.status === "success") {
        const [elo, wins, losses, earnings] = statsRes.result as [
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        stats.elo = Number(elo);
        stats.wins = Number(wins);
        stats.losses = Number(losses);
        stats.earnings = Number(earnings) / ONEG;
      }
      let f = adaptFighter(
        {
          tokenId: tokenIds[i],
          owner: ownerRes.result as `0x${string}`,
          metadataHash:
            hashRes.status === "success"
              ? (hashRes.result as `0x${string}`)
              : "0x0000000000000000000000000000000000000000000000000000000000000000",
          encryptedURI:
            uriRes.status === "success" ? (uriRes.result as string) : "",
        },
        stats,
      );
      const meta = metaMap[tokenIds[i].toString()];
      if (meta) {
        f = {
          ...f,
          name: meta.name || f.name,
          arch: (meta.archetype as FighterArchetype) || f.arch,
          forRent: meta.forRent ?? false,
          rentPrice: meta.rentPrice ?? 0,
        };
      }
      // Overlay authoritative listing state from the Marketplace contract.
      // Server meta may have stale forSale/price from pre-contract mock; chain wins.
      if (listingData) {
        const lres = listingData[i];
        if (lres?.status === "success") {
          const raw = lres.result as unknown;
          let active = false;
          let priceWei = 0n;
          if (Array.isArray(raw)) {
            [, , priceWei, , active] = raw as [
              bigint,
              `0x${string}`,
              bigint,
              bigint,
              boolean,
            ];
          } else if (raw && typeof raw === "object") {
            const obj = raw as {
              active: boolean;
              price: bigint;
            };
            active = obj.active;
            priceWei = obj.price;
          }
          f = {
            ...f,
            forSale: active,
            price: active ? Number(formatEther(priceWei)) : 0,
          };
        }
      }
      // Overlay RentalEscrow state. Two results per token (listing, active).
      const nowMs = Date.now();
      if (rentalData) {
        const listingRes = rentalData[i * 2];
        const activeRes = rentalData[i * 2 + 1];
        if (listingRes?.status === "success") {
          const raw = listingRes.result as unknown;
          let rlOwner: `0x${string}` | null = null;
          let rlPriceWei = 0n;
          let rlActive = false;
          if (Array.isArray(raw)) {
            const [, ownerA, ppd, , , activeA] = raw as [
              bigint,
              `0x${string}`,
              bigint,
              bigint,
              bigint,
              boolean,
            ];
            rlOwner = ownerA;
            rlPriceWei = ppd;
            rlActive = activeA;
          } else if (raw && typeof raw === "object") {
            const obj = raw as {
              owner: `0x${string}`;
              pricePerDay: bigint;
              active: boolean;
            };
            rlOwner = obj.owner;
            rlPriceWei = obj.pricePerDay;
            rlActive = obj.active;
          }
          if (rlActive && rlOwner) {
            f = {
              ...f,
              owner: rlOwner,
              forRent: true,
              rentPrice: Number(formatEther(rlPriceWei)),
            };
          } else {
            f = { ...f, forRent: false, rentPrice: 0 };
          }
        }
        // Active rental overlay: decodes {renter, startedAt, expiresAt, paid}.
        // When a rental is active, the listing is inactive (escrow resets it
        // on rent) — so we also treat active.renter as the "effective user"
        // for Vault filtering so the renter sees the fighter in "Rented in".
        if (activeRes?.status === "success") {
          const raw = activeRes.result as unknown;
          let renter: `0x${string}` | null = null;
          let expiresAt = 0n;
          if (Array.isArray(raw)) {
            const [r, , exp] = raw as [`0x${string}`, bigint, bigint, bigint];
            renter = r;
            expiresAt = exp;
          } else if (raw && typeof raw === "object") {
            const obj = raw as {
              renter: `0x${string}`;
              expiresAt: bigint;
            };
            renter = obj.renter;
            expiresAt = obj.expiresAt;
          }
          const expiresMs = Number(expiresAt) * 1000;
          const zero = "0x0000000000000000000000000000000000000000";
          if (
            renter &&
            renter.toLowerCase() !== zero &&
            expiresMs > nowMs
          ) {
            f = {
              ...f,
              rentedBy: renter,
              rentExpiresAt: expiresMs,
            };
          }
        }
      }
      fighters.push(f);
    }
  }

  // Effective-owner filter. Applied here (post rental overlay) so a user's
  // fighters currently in rental escrow still surface in their Vault —
  // whether they listed it for rent (owner match) or rented someone else's
  // (rentedBy match).
  const filtered = owner
    ? fighters.filter((f) => {
        const o = owner.toLowerCase();
        return (
          f.owner.toLowerCase() === o ||
          (f.rentedBy ? f.rentedBy.toLowerCase() === o : false)
        );
      })
    : fighters;
  const limited = filtered.slice(0, limit);

  return {
    data: limited,
    isLoading: eventsLoading || readsLoading,
    error: eventsError ?? error ?? null,
    refetch,
  } as const;
}
