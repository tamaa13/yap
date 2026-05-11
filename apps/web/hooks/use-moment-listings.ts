"use client";

// Active Moment listings on the Moment marketplace.
//
// Discovery: scan the `Listed` event on MOMENT_MARKET_ADDRESS to learn
// the set of tokenIds that have ever been listed. For each, read
// `getListing(tokenId)` to filter down to currently-active rows. In
// parallel pull `momentOf(tokenId)` from MomentINFT so the UI has
// battle / round / side context per listing.
//
// Same testnet-scale strategy as use-fighters: full event scan + slice.
// Production migration: subgraph or paged-cursor indexer.

import { useEffect, useMemo, useState } from "react";
import { formatEther, parseAbiItem, type Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import {
  MARKETPLACE_ABI,
  MOMENT_INFT_ABI,
  MOMENT_INFT_ADDRESS,
  MOMENT_MARKET_ADDRESS,
} from "@/lib/contracts";

export interface MomentListing {
  tokenId: number;
  seller: `0x${string}`;
  priceWei: bigint;
  /** Listing price in 0G (eth units). */
  price: number;
  /** ms epoch. */
  listedAt: number;
  /** Battle context — pulled from MomentINFT.momentOf so the card can
   *  show the source. Side: 0 = A, 1 = B. */
  battleId: number;
  fighterTokenId: number;
  roundNo: number;
  side: 0 | 1;
}

const LISTED_EVENT = parseAbiItem(
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
);

export function useMomentListings() {
  const client = usePublicClient();
  const [tokenIds, setTokenIds] = useState<bigint[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<Error | null>(null);

  useEffect(() => {
    if (!client || MOMENT_MARKET_ADDRESS === "") {
      setTokenIds([]);
      setEventsLoading(false);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);
    (async () => {
      try {
        const logs = await client.getLogs({
          address: MOMENT_MARKET_ADDRESS as Address,
          event: LISTED_EVENT,
          fromBlock: "earliest",
          toBlock: "latest",
        });
        const seen = new Set<string>();
        for (const log of logs) {
          const tokenId = (log.args as { tokenId?: bigint }).tokenId;
          if (tokenId !== undefined) seen.add(tokenId.toString());
        }
        if (cancelled) return;
        setTokenIds(
          Array.from(seen)
            .map((s) => BigInt(s))
            .sort((a, b) => Number(b - a)),
        );
        setEventsLoading(false);
      } catch (e) {
        if (cancelled) return;
        setTokenIds([]);
        setEventsLoading(false);
        setEventsError(
          e instanceof Error ? e : new Error("failed to load listings"),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Pair-read: per-token listing struct + moment context.
  const reads = useReadContracts({
    allowFailure: true,
    contracts:
      tokenIds.length > 0 &&
      MOMENT_MARKET_ADDRESS !== "" &&
      MOMENT_INFT_ADDRESS !== ""
        ? tokenIds.flatMap((id) => [
            {
              address: MOMENT_MARKET_ADDRESS as Address,
              abi: MARKETPLACE_ABI,
              functionName: "getListing",
              args: [id],
            },
            {
              address: MOMENT_INFT_ADDRESS as Address,
              abi: MOMENT_INFT_ABI,
              functionName: "momentOf",
              args: [id],
            },
          ])
        : [],
    query: {
      enabled:
        tokenIds.length > 0 &&
        MOMENT_MARKET_ADDRESS !== "" &&
        MOMENT_INFT_ADDRESS !== "",
    },
  });

  const data = useMemo<MomentListing[]>(() => {
    if (!reads.data) return [];
    const out: MomentListing[] = [];
    for (let i = 0; i < tokenIds.length; i++) {
      const [listingRes, momentRes] = reads.data.slice(i * 2, i * 2 + 2);
      if (
        !listingRes ||
        !momentRes ||
        listingRes.status !== "success" ||
        momentRes.status !== "success"
      ) {
        continue;
      }
      const listing = decodeListing(listingRes.result);
      if (!listing || !listing.active) continue;
      const moment = decodeMoment(momentRes.result);
      if (!moment) continue;
      out.push({
        tokenId: Number(tokenIds[i]),
        seller: listing.seller,
        priceWei: listing.priceWei,
        price: Number(formatEther(listing.priceWei)),
        listedAt: Number(listing.listedAtSec) * 1000,
        battleId: moment.battleId,
        fighterTokenId: moment.fighterTokenId,
        roundNo: moment.roundNo,
        side: moment.side,
      });
    }
    return out;
  }, [reads.data, tokenIds]);

  return {
    data,
    isLoading: eventsLoading || reads.isLoading,
    error: eventsError ?? reads.error ?? null,
    refetch: reads.refetch,
  } as const;
}

// ─── decoders ────────────────────────────────────────────────────────────

function decodeListing(raw: unknown): {
  seller: `0x${string}`;
  priceWei: bigint;
  listedAtSec: bigint;
  active: boolean;
} | null {
  if (Array.isArray(raw)) {
    const [, seller, priceWei, listedAtSec, active] = raw as [
      bigint,
      `0x${string}`,
      bigint,
      bigint,
      boolean,
    ];
    return { seller, priceWei, listedAtSec, active };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as {
      seller: `0x${string}`;
      price: bigint;
      listedAt: bigint;
      active: boolean;
    };
    return {
      seller: obj.seller,
      priceWei: obj.price,
      listedAtSec: obj.listedAt,
      active: obj.active,
    };
  }
  return null;
}

function decodeMoment(raw: unknown): {
  battleId: number;
  fighterTokenId: number;
  roundNo: number;
  side: 0 | 1;
} | null {
  if (Array.isArray(raw)) {
    const [battleId, fighterTokenId, , roundNo, side] = raw as [
      bigint,
      bigint,
      `0x${string}`,
      number,
      number,
    ];
    return {
      battleId: Number(battleId),
      fighterTokenId: Number(fighterTokenId),
      roundNo: Number(roundNo),
      side: (side === 1 ? 1 : 0) as 0 | 1,
    };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as {
      battleId: bigint;
      fighterTokenId: bigint;
      roundNo: number;
      side: number;
    };
    return {
      battleId: Number(obj.battleId),
      fighterTokenId: Number(obj.fighterTokenId),
      roundNo: Number(obj.roundNo),
      side: (Number(obj.side) === 1 ? 1 : 0) as 0 | 1,
    };
  }
  return null;
}
