import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
  FIGHTER_INFT_ABI,
  FIGHTER_INFT_ADDRESS,
  RENTAL_ESCROW_ABI,
  RENTAL_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { usePendingChallenges } from "@/hooks/use-pending-challenges";
import { renderHookWithProviders } from "../utils/render";
import { rpcServer, type AddressMock } from "../utils/rpc";
import { encodeEventLog } from "../utils/events";
import { TEST_USER, TEST_USER_B, TEST_USER_C } from "../utils/wagmi";
import { server } from "../mocks/server";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;

// startTime baseline: 2026-05-12 09:00 UTC (1 hour before our fake "now"
// at 10:00). The 24h challenge-expiry window keeps this entry alive.
const NOW = new Date("2026-05-12T10:00:00Z");
const ONE_HOUR_AGO_SEC = BigInt(Math.floor(new Date("2026-05-12T09:00:00Z").getTime() / 1000));
const TWO_DAYS_AGO_SEC = BigInt(Math.floor(new Date("2026-05-10T10:00:00Z").getTime() / 1000));

interface BattleSeed {
  battleId: bigint;
  fighterA: bigint;
  fighterB: bigint;
  creator: `0x${string}`;
  startTimeSec: bigint;
  status: number; // 0=Pending
  topic?: string;
  /** ownerOf(fighterB) — the on-chain holder. */
  fighterBOwner: `0x${string}`;
  /** Optional active rental: when set, the renter is the operational
   *  defender per the v28 fix. */
  fighterBRenter?: { renter: `0x${string}`; expiresAtSec: bigint };
}

function battleStruct(b: BattleSeed) {
  return {
    fighterA: b.fighterA,
    fighterB: b.fighterB,
    creator: b.creator,
    startTime: b.startTimeSec,
    verdictTime: 0n,
    maxRounds: 3,
    winner: 0,
    status: b.status,
    poolA: 0n,
    poolB: 0n,
    feeCollected: 0n,
    topic: b.topic ?? "T",
    verdictSig: "0x" as `0x${string}`,
    verdictHash: ZERO_HASH as `0x${string}`,
    totalClaimed: 0n,
    settledAt: 0n,
    royaltyPaid: 0n,
  };
}

function buildScenario(seeds: BattleSeed[]): AddressMock[] {
  const logs = seeds.map((s) => {
    const { topics, data } = encodeEventLog({
      abi: BATTLE_ESCROW_ABI,
      eventName: "BattleCreated",
      args: {
        battleId: s.battleId,
        fighterA: s.fighterA,
        fighterB: s.fighterB,
        creator: s.creator,
        topic: s.topic ?? "T",
        maxRounds: 3,
      },
    });
    return { topics, data };
  });

  return [
    {
      to: BATTLE_ESCROW_ADDRESS as `0x${string}`,
      abi: BATTLE_ESCROW_ABI,
      logs,
      functions: {
        getBattle: (args: readonly unknown[]) => {
          const [id] = args as readonly [bigint];
          const seed = seeds.find((s) => s.battleId === id);
          if (!seed) throw new Error(`no battle seed for id ${id}`);
          return battleStruct(seed);
        },
      },
    },
    {
      to: FIGHTER_INFT_ADDRESS as `0x${string}`,
      abi: FIGHTER_INFT_ABI,
      functions: {
        ownerOf: (args: readonly unknown[]) => {
          const [tokenId] = args as readonly [bigint];
          const seed = seeds.find((s) => s.fighterB === tokenId);
          return seed?.fighterBOwner ?? ZERO_ADDR;
        },
      },
    },
    {
      to: RENTAL_ESCROW_ADDRESS as `0x${string}`,
      abi: RENTAL_ESCROW_ABI,
      functions: {
        getActiveRental: (args: readonly unknown[]) => {
          const [tokenId] = args as readonly [bigint];
          const seed = seeds.find((s) => s.fighterB === tokenId);
          const r = seed?.fighterBRenter;
          return r
            ? {
                renter: r.renter,
                startedAt: 1700000000n,
                expiresAt: r.expiresAtSec,
                paid: 0n,
              }
            : {
                renter: ZERO_ADDR,
                startedAt: 0n,
                expiresAt: 0n,
                paid: 0n,
              };
        },
      },
    },
  ];
}

describe("usePendingChallenges", () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns no challenges when the user has none on chain", async () => {
    server.use(rpcServer(buildScenario([])));
    const { result } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.incoming).toEqual([]);
    expect(result.current.outgoing).toEqual([]);
  });

  it("classifies a challenge as INCOMING when the user owns fighterB", async () => {
    server.use(
      rpcServer(
        buildScenario([
          {
            battleId: 5n,
            fighterA: 1n,
            fighterB: 2n,
            creator: TEST_USER_B,
            startTimeSec: ONE_HOUR_AGO_SEC,
            status: 0,
            fighterBOwner: TEST_USER, // I'm the owner of fighterB
          },
        ]),
      ),
    );
    const { result } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() => expect(result.current.incoming.length).toBe(1));
    expect(result.current.incoming[0].battleId).toBe(5);
    expect(result.current.outgoing).toEqual([]);
  });

  it("classifies a challenge as OUTGOING when the user is the creator", async () => {
    server.use(
      rpcServer(
        buildScenario([
          {
            battleId: 6n,
            fighterA: 1n,
            fighterB: 2n,
            creator: TEST_USER, // I'm the challenger
            startTimeSec: ONE_HOUR_AGO_SEC,
            status: 0,
            fighterBOwner: TEST_USER_B, // someone else owns fighterB
          },
        ]),
      ),
    );
    const { result } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() => expect(result.current.outgoing.length).toBe(1));
    expect(result.current.outgoing[0].battleId).toBe(6);
    expect(result.current.incoming).toEqual([]);
  });

  it("v28 renter-as-defender: RENTER sees a challenge against the rented fighter even though they don't own it", async () => {
    // Fighter 20 case from the v28 bug: original owner listed the fighter
    // for rent (custody → RentalEscrow), renter currently holds the lease.
    // ownerOf(fighterB) = RentalEscrow address (NOT the user), but the
    // renter has operational control and must see the incoming challenge
    // or it auto-expires without anyone able to accept.
    const FUTURE_EXPIRES_SEC = BigInt(
      Math.floor(new Date("2026-05-15T00:00:00Z").getTime() / 1000),
    );
    server.use(
      rpcServer(
        buildScenario([
          {
            battleId: 7n,
            fighterA: 1n,
            fighterB: 20n,
            creator: TEST_USER_C, // challenger
            startTimeSec: ONE_HOUR_AGO_SEC,
            status: 0,
            fighterBOwner: "0x4444444444444444444444444444444444444444",
            fighterBRenter: {
              renter: TEST_USER, // I'm the active renter
              expiresAtSec: FUTURE_EXPIRES_SEC,
            },
          },
        ]),
      ),
    );
    const { result } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() => expect(result.current.incoming.length).toBe(1));
    expect(result.current.incoming[0].battleId).toBe(7);
    expect(result.current.outgoing).toEqual([]);
  });

  it("filters out challenges past the 24h auto-expiry window", async () => {
    server.use(
      rpcServer(
        buildScenario([
          {
            battleId: 8n,
            fighterA: 1n,
            fighterB: 2n,
            creator: TEST_USER_B,
            startTimeSec: TWO_DAYS_AGO_SEC, // 2d > 24h expiry
            status: 0,
            fighterBOwner: TEST_USER,
          },
        ]),
      ),
    );
    const { result } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.incoming).toEqual([]);
  });

  it("skips non-Pending battles (Live / Settled)", async () => {
    server.use(
      rpcServer(
        buildScenario([
          {
            battleId: 9n,
            fighterA: 1n,
            fighterB: 2n,
            creator: TEST_USER_B,
            startTimeSec: ONE_HOUR_AGO_SEC,
            status: 1, // Live, not Pending
            fighterBOwner: TEST_USER,
          },
        ]),
      ),
    );
    const { result } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.incoming).toEqual([]);
    expect(result.current.outgoing).toEqual([]);
  });

  it("ignores a stale active-rental whose expiresAt has lapsed", async () => {
    // The rental tuple still on-chain (no settle call) but its expiresAt
    // has passed. Renter loses operational control → no incoming match.
    const LAPSED_EXPIRES_SEC = BigInt(
      Math.floor(new Date("2026-05-11T00:00:00Z").getTime() / 1000),
    );
    server.use(
      rpcServer(
        buildScenario([
          {
            battleId: 10n,
            fighterA: 1n,
            fighterB: 20n,
            creator: TEST_USER_C,
            startTimeSec: ONE_HOUR_AGO_SEC,
            status: 0,
            fighterBOwner: "0x4444444444444444444444444444444444444444",
            fighterBRenter: {
              renter: TEST_USER,
              expiresAtSec: LAPSED_EXPIRES_SEC,
            },
          },
        ]),
      ),
    );
    const { result } = renderHookWithProviders(() =>
      usePendingChallenges(TEST_USER),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.incoming).toEqual([]);
  });
});
