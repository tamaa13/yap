import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { parseEther } from "viem";
import { useFighter } from "@/hooks/use-fighter";
import { usePendingChallenges } from "@/hooks/use-pending-challenges";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import type { Battle, Fighter } from "@/lib/types";
import { renderHookWithProviders, renderWithProviders } from "../utils/render";
import { rpcServer } from "../utils/rpc";
import { fighterApiHandler, fighterMocks } from "../utils/fixtures";
import { encodeEventLog } from "../utils/events";
import { TEST_USER, TEST_USER_B, TEST_USER_C } from "../utils/wagmi";
import { server } from "../mocks/server";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;
const RENTAL_VAULT = "0x4444444444444444444444444444444444444444" as `0x${string}`;

// Component-side mocks: bypass RainbowKit + the live wagmi connector flow
// for the ArenaPending render assertion. Test exercises real wagmi reads
// via msw for everything except the wallet identity itself.
vi.mock("@/hooks/use-wallet", () => ({
  useWallet: () => ({
    ready: true,
    connected: true,
    addr: TEST_USER,
    email: undefined,
    wallet: undefined,
    chainId: 16602,
    login: () => {},
    logout: () => {},
  }),
}));

vi.mock("@/hooks/use-accept-battle", () => ({
  useAcceptBattle: () => ({
    error: null,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    txHash: undefined,
    write: vi.fn().mockResolvedValue("0xabc"),
  }),
  useDeclineBattle: () => ({
    error: null,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    txHash: undefined,
    write: vi.fn().mockResolvedValue("0xabc"),
  }),
}));

vi.mock("@/hooks/use-subname", () => ({
  useSubname: () => ({
    label: null,
    fullName: null,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { ArenaPending } from "@/app/(app)/arenas/[battleId]/arena-pending";

const ONE_HOUR_AGO_SEC = BigInt(
  Math.floor(new Date("2026-05-12T09:00:00Z").getTime() / 1000),
);
const FUTURE_EXPIRES_SEC = BigInt(
  Math.floor(new Date("2026-05-15T00:00:00Z").getTime() / 1000),
);

/** Scenario: Fighter 20 is owned by user C, listed for rent, currently
 *  leased to user A (TEST_USER). User B has just created a pending
 *  challenge with their Fighter 1 against Fighter 20. */
function fighter20Scenario() {
  const fixture = {
    tokenId: 20,
    owner: RENTAL_VAULT, // RentalEscrow holds custody during active lease
    rentListing: { owner: TEST_USER_C, pricePerDayWei: parseEther("1") },
    activeRental: { renter: TEST_USER, expiresAtSec: FUTURE_EXPIRES_SEC },
  };

  // Logs for usePendingChallenges' event scan.
  const { topics, data } = encodeEventLog({
    abi: BATTLE_ESCROW_ABI,
    eventName: "BattleCreated",
    args: {
      battleId: 7n,
      fighterA: 1n,
      fighterB: 20n,
      creator: TEST_USER_B,
      topic: "rental clash",
      maxRounds: 3,
    },
  });

  const battleStruct = {
    fighterA: 1n,
    fighterB: 20n,
    creator: TEST_USER_B,
    startTime: ONE_HOUR_AGO_SEC,
    verdictTime: 0n,
    maxRounds: 3,
    winner: 0,
    status: 0, // Pending
    poolA: parseEther("1"), // challenger staked 1 0G
    poolB: 0n,
    feeCollected: 0n,
    topic: "rental clash",
    verdictSig: "0x" as `0x${string}`,
    verdictHash: ZERO_HASH as `0x${string}`,
    totalClaimed: 0n,
    settledAt: 0n,
    royaltyPaid: 0n,
  };

  // BATTLE_ESCROW gets two distinct mocks (getBattle from
  // usePendingChallenges + ArenaPending's `battles` mapping auto-getter).
  // The rpc dispatcher tolerates both registered on the same address.
  const allMocks = [
    ...fighterMocks(fixture),
    {
      to: BATTLE_ESCROW_ADDRESS as `0x${string}`,
      abi: BATTLE_ESCROW_ABI,
      logs: [{ topics, data }],
      functions: {
        getBattle: () => battleStruct,
        // Positional flatten for the auto-getter — matches v31 test fixture.
        battles: () => [
          battleStruct.fighterA,
          battleStruct.fighterB,
          battleStruct.creator,
          battleStruct.startTime,
          battleStruct.verdictTime,
          battleStruct.maxRounds,
          battleStruct.winner,
          battleStruct.status,
          battleStruct.poolA,
          battleStruct.poolB,
          battleStruct.feeCollected,
          battleStruct.topic,
          battleStruct.verdictSig,
          battleStruct.verdictHash,
          battleStruct.totalClaimed,
          battleStruct.settledAt,
          battleStruct.royaltyPaid,
        ],
      },
    },
  ];
  // The fighterMocks already registered BATTLE_ESCROW? No — fighterMocks
  // covers FIGHTER_INFT, BATTLE_REGISTRY, MARKETPLACE, RENTAL_ESCROW.
  // BattleEscrow comes in via this last entry so the dispatcher routes
  // both `getBattle` (events-driven incoming feed) AND `battles`
  // (component-side stake read) through the same fixture.
  return { allMocks, fixture };
}

describe("Integration: rental challenge end-to-end (Fighter 20 reality)", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renter sees the rented fighter as theirs, the incoming challenge appears, and ArenaPending exposes Accept", async () => {
    const { allMocks, fixture } = fighter20Scenario();
    server.use(rpcServer(allMocks), fighterApiHandler(fixture));

    // 1. useFighter as the renter — fighter 20 should populate rentedBy
    //    AND keep forRent=true (the v33 parallel overlay).
    const { result: fighterResult } = renderHookWithProviders(() =>
      useFighter(20),
    );
    await waitFor(() =>
      expect(fighterResult.current.data?.rentedBy?.toLowerCase()).toBe(
        TEST_USER,
      ),
    );
    expect(fighterResult.current.data?.forRent).toBe(true);
    expect(fighterResult.current.data?.owner.toLowerCase()).toBe(TEST_USER_C);

    // 2. usePendingChallenges as the renter — the challenge MUST surface
    //    as incoming despite ownerOf(20) === RentalEscrow vault.
    const { result: challengesResult } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() =>
      expect(challengesResult.current.incoming.length).toBe(1),
    );
    expect(challengesResult.current.incoming[0].battleId).toBe(7);

    // 3. ArenaPending rendered with the merged Fighter shape (rentedBy
    //    set) exposes the Accept CTA for the renter.
    const fighterB = fighterResult.current.data as Fighter;
    const fighterA: Fighter = {
      id: 1,
      name: "Fighter 1",
      arch: "scholar",
      elo: 1200,
      w: 0,
      l: 0,
      earnings: 0,
      owner: TEST_USER_B,
      forSale: false,
      forRent: false,
      color: "#fff",
      hp: 50,
      logic: 50,
      wit: 50,
      tags: [],
      battles: 0,
      attest: "0x",
      traits: null,
    };
    const battle: Battle = {
      id: "b-0007",
      status: "upcoming",
      round: 0,
      maxRound: 3,
      topic: "rental clash",
      a: 1,
      b: 20,
      pool: 0,
      spectators: 0,
      endsIn: null,
      startedAt: Date.now(),
      oddsA: 1,
      oddsB: 1,
    };
    renderWithProviders(
      <ArenaPending
        uiId="b-0007"
        battle={battle}
        fighterA={fighterA}
        fighterB={fighterB}
      />,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /step in|stake too low/i }),
      ).toBeInTheDocument(),
    );
  });
});
