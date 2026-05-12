import { http, HttpResponse } from "msw";
import type { AddressMock } from "./rpc";
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

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;

export interface FighterFixture {
  tokenId: number;
  /** Owner returned by `FIGHTER_INFT.ownerOf`. For a fighter with an active
   *  rental, this is the on-chain owner (which the rental-listing overlay
   *  swaps back to the original lister via `RentalEscrow.getRentListing`). */
  owner: `0x${string}`;
  /** Marketplace listing: when set, `getListing(.active = true)` returns
   *  this. Otherwise an inactive zero listing. */
  forSale?: { seller: `0x${string}`; priceWei: bigint };
  /** Standing rental listing on RentalEscrow. */
  rentListing?: { owner: `0x${string}`; pricePerDayWei: bigint };
  /** Active rental on RentalEscrow. Both rentListing AND activeRental can
   *  be set simultaneously — v33's parallel-overlay fix exists exactly so
   *  Fighter 20 (listed-for-rent AND currently rented) populates both
   *  `forRent: true` AND `rentedBy`. */
  activeRental?: {
    renter: `0x${string}`;
    startedAtSec?: bigint;
    expiresAtSec: bigint;
    paidWei?: bigint;
  };
  /** On-chain stats. Defaults to a zero-ELO, no-battles fighter. */
  stats?: { elo: number; wins: number; losses: number; earningsWei: bigint };
  /** Effective on-chain user (renter during active lease, else owner).
   *  Defaults: rental.renter if active, else owner. */
  effectiveUser?: `0x${string}`;
  /** Optional /api/fighters/[id] payload override. Default returns null
   *  (the hook tolerates null and falls back to synthesized metadata). */
  apiMeta?: Record<string, unknown> | null;
}

/** Build the full set of AddressMocks needed for `useFighter(tokenId)`
 *  to resolve. Covers ownerOf/metadataHash/encryptedURI + stats +
 *  Marketplace listing + RentalEscrow getRentListing/getActiveRental/
 *  effectiveUser/getDispute. */
export function fighterMocks(f: FighterFixture): AddressMock[] {
  const stats = f.stats ?? { elo: 0, wins: 0, losses: 0, earningsWei: 0n };
  const effectiveUser =
    f.effectiveUser ??
    (f.activeRental?.renter ?? f.owner);

  const fighterContract: AddressMock = {
    to: FIGHTER_INFT_ADDRESS as `0x${string}`,
    abi: FIGHTER_INFT_ABI,
    functions: {
      ownerOf: () => f.owner,
      metadataHash: () => ZERO_HASH,
      encryptedURI: () => "",
    },
  };

  const battleRegistry: AddressMock = {
    to: BATTLE_REGISTRY_ADDRESS as `0x${string}`,
    abi: BATTLE_REGISTRY_ABI,
    functions: {
      // Note: BattleRegistry.fighterStats returns 4 separate outputs
      // (elo, wins, losses, earnings) — viem expects an array, not an object.
      fighterStats: () => [
        BigInt(stats.elo),
        BigInt(stats.wins),
        BigInt(stats.losses),
        stats.earningsWei,
      ],
    },
  };

  const marketplace: AddressMock = {
    to: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functions: {
      getListing: () =>
        f.forSale
          ? {
              tokenId: BigInt(f.tokenId),
              seller: f.forSale.seller,
              price: f.forSale.priceWei,
              listedAt: 1700000000n,
              active: true,
            }
          : {
              tokenId: BigInt(f.tokenId),
              seller: ZERO_ADDR,
              price: 0n,
              listedAt: 0n,
              active: false,
            },
    },
  };

  const rentalEscrow: AddressMock = {
    to: RENTAL_ESCROW_ADDRESS as `0x${string}`,
    abi: RENTAL_ESCROW_ABI,
    functions: {
      getRentListing: () =>
        f.rentListing
          ? {
              tokenId: BigInt(f.tokenId),
              owner: f.rentListing.owner,
              pricePerDay: f.rentListing.pricePerDayWei,
              maxDurationDays: 7n,
              listedAt: 1700000000n,
              active: true,
              disputable: false,
            }
          : {
              tokenId: BigInt(f.tokenId),
              owner: ZERO_ADDR,
              pricePerDay: 0n,
              maxDurationDays: 0n,
              listedAt: 0n,
              active: false,
              disputable: false,
            },
      getActiveRental: () =>
        f.activeRental
          ? {
              renter: f.activeRental.renter,
              startedAt: f.activeRental.startedAtSec ?? 1700000000n,
              expiresAt: f.activeRental.expiresAtSec,
              paid: f.activeRental.paidWei ?? 0n,
            }
          : {
              renter: ZERO_ADDR,
              startedAt: 0n,
              expiresAt: 0n,
              paid: 0n,
            },
      effectiveUser: () => effectiveUser,
      getDispute: () => ({
        status: 0,
        renter: ZERO_ADDR,
        owner: ZERO_ADDR,
        disputeWindowEnds: 0n,
        maxLifetimeEnds: 0n,
        escrowed: 0n,
        ownerProposalHash: ZERO_HASH,
        renterProposalHash: ZERO_HASH,
      }),
    },
  };

  return [fighterContract, battleRegistry, marketplace, rentalEscrow];
}

/** Handler for `/api/fighters/[tokenId]` — the server-meta overlay path
 *  inside `useFighter`. The hook tolerates a 404 / null gracefully, so
 *  `apiMeta: null` (the default) returns `null` with a 200 status. */
export function fighterApiHandler(f: FighterFixture) {
  return http.get(
    `http://localhost:3000/api/fighters/${f.tokenId}`,
    () => HttpResponse.json(f.apiMeta ?? null),
  );
}
