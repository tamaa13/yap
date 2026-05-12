import { describe, expect, it } from "vitest";
import {
  adaptBattle,
  adaptFighter,
  mapBattleStatus,
  parseBattleId,
  type OnChainBattleRaw,
  type OnChainFighterCore,
  type OnChainFighterStats,
} from "@/lib/on-chain";

const ZERO_HASH = `0x${"00".repeat(32)}` as const;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

describe("mapBattleStatus", () => {
  it("maps Pending → upcoming", () => {
    expect(mapBattleStatus(0)).toBe("upcoming");
  });
  it("maps Live → live", () => {
    expect(mapBattleStatus(1)).toBe("live");
  });
  it("maps Verdict / Settled / Cancelled → past", () => {
    expect(mapBattleStatus(2)).toBe("past");
    expect(mapBattleStatus(3)).toBe("past");
    expect(mapBattleStatus(4)).toBe("past");
  });
  it("defaults unknown enum values to upcoming", () => {
    expect(mapBattleStatus(99)).toBe("upcoming");
    expect(mapBattleStatus(-1)).toBe("upcoming");
  });
});

describe("parseBattleId", () => {
  it("parses `b-<hex>` ids", () => {
    expect(parseBattleId("b-0001")).toBe(1n);
    expect(parseBattleId("b-00ff")).toBe(255n);
    expect(parseBattleId("b-1A")).toBe(26n);
  });
  it("rejects malformed inputs", () => {
    expect(parseBattleId("b-")).toBeNull();
    expect(parseBattleId("battle-1")).toBeNull();
    expect(parseBattleId("")).toBeNull();
    expect(parseBattleId("b-zz")).toBeNull();
  });
});

describe("adaptBattle", () => {
  function rawBattle(overrides: Partial<OnChainBattleRaw> = {}): OnChainBattleRaw {
    return {
      fighterA: 1n,
      fighterB: 2n,
      creator: "0x1111111111111111111111111111111111111111",
      startTime: 1000n,
      verdictTime: 0n,
      maxRounds: 3,
      winner: 0,
      status: 1,
      poolA: 0n,
      poolB: 0n,
      feeCollected: 0n,
      topic: "Coffee vs tea",
      verdictSig: ZERO_HASH,
      ...overrides,
    };
  }

  it("formats id as zero-padded 4-hex", () => {
    expect(adaptBattle(1n, rawBattle()).id).toBe("b-0001");
    expect(adaptBattle(255n, rawBattle()).id).toBe("b-00ff");
    expect(adaptBattle(0x1234n, rawBattle()).id).toBe("b-1234");
  });

  it("converts second-resolution timestamps to ms", () => {
    const b = adaptBattle(1n, rawBattle({ startTime: 1700000000n }));
    expect(b.startedAt).toBe(1700000000 * 1000);
  });

  it("omits startedAt for unstarted battles (startTime === 0)", () => {
    const b = adaptBattle(1n, rawBattle({ startTime: 0n }));
    expect(b.startedAt).toBeNull();
  });

  it("defaults odds to 1.0× when no bets are placed", () => {
    const b = adaptBattle(1n, rawBattle({ poolA: 0n, poolB: 0n }));
    expect(b.oddsA).toBe(1);
    expect(b.oddsB).toBe(1);
  });

  it("computes pari-mutuel odds when both sides have bets", () => {
    // poolA = 1 0G, poolB = 3 0G → total 4 0G
    // oddsA = 4 / 1 = 4.00, oddsB = 4 / 3 = 1.33
    const b = adaptBattle(1n, rawBattle({
      poolA: 1_000_000_000_000_000_000n,
      poolB: 3_000_000_000_000_000_000n,
    }));
    expect(b.oddsA).toBe(4);
    expect(b.oddsB).toBe(1.33);
    expect(b.pool).toBe(4);
  });

  it("surfaces winner only for past battles with a non-tie verdict", () => {
    const liveTied = adaptBattle(1n, rawBattle({ status: 1, winner: 2 }));
    expect(liveTied.winner).toBeUndefined();
    const settledA = adaptBattle(1n, rawBattle({ status: 3, winner: 0 }));
    expect(settledA.winner).toBe("a");
    const settledB = adaptBattle(1n, rawBattle({ status: 3, winner: 1 }));
    expect(settledB.winner).toBe("b");
    const settledTie = adaptBattle(1n, rawBattle({ status: 3, winner: 2 }));
    expect(settledTie.winner).toBeUndefined();
  });

  it("surfaces verdictTime only after the battle has settled", () => {
    const live = adaptBattle(1n, rawBattle({ status: 1, verdictTime: 999n }));
    expect(live.endedAt).toBeUndefined();
    const settled = adaptBattle(1n, rawBattle({ status: 3, verdictTime: 999n }));
    expect(settled.endedAt).toBe(999 * 1000);
  });
});

describe("adaptFighter", () => {
  function core(overrides: Partial<OnChainFighterCore> = {}): OnChainFighterCore {
    return {
      tokenId: 1n,
      owner: ZERO_ADDR,
      metadataHash: ZERO_HASH,
      encryptedURI: "",
      ...overrides,
    };
  }
  const zeroStats: OnChainFighterStats = { elo: 0, wins: 0, losses: 0, earnings: 0 };

  it("synthesizes stable name / archetype / color from tokenId + hash", () => {
    const a = adaptFighter(core({ tokenId: 1n }), zeroStats);
    const b = adaptFighter(core({ tokenId: 1n }), zeroStats);
    expect(a.name).toBe("Fighter #1");
    expect(a.arch).toBe(b.arch);
    expect(a.color).toBe(b.color);
  });

  it("defaults ELO to 1200 when the registry has no record", () => {
    const f = adaptFighter(core(), zeroStats);
    expect(f.elo).toBe(1200);
  });

  it("derives Logic from ELO modifier", () => {
    const f0 = adaptFighter(core(), zeroStats);
    const f300 = adaptFighter(core(), { ...zeroStats, elo: 1500 });
    // +300 ELO → +20 Logic (clamped if needed)
    expect(f300.logic - f0.logic).toBe(20);
  });

  it("clamps stats into [0, 100]", () => {
    const huge = adaptFighter(core(), { elo: 9999, wins: 999, losses: 0, earnings: 0 });
    expect(huge.logic).toBeLessThanOrEqual(100);
    expect(huge.wit).toBeLessThanOrEqual(100);
    expect(huge.hp).toBeLessThanOrEqual(100);
  });
});
