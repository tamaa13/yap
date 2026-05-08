// Utilities for mapping on-chain contract state into the UI types. Keeps the
// screens agnostic to the raw struct shapes returned from wagmi reads.

import { keccak256, toHex, type Address } from "viem";
import type { Battle, BattleStatus, Fighter, FighterArchetype } from "./types";

// Addresses present on chain but off-chain metadata not yet wired. Synthesize
// display-only fields from the tokenId so each fighter stays visually stable
// across sessions. Palette is the Promoter accent set — crimson + gold are
// the corner colors, plus the warm-coherent semantic accents (success, info,
// danger). Avatar tinting picks one per tokenId via a stable hash.
const PALETTE = [
  "#C8102E", // crimson — Corner A signature
  "#C9A961", // gold — Corner B signature
  "#5BA855", // success
  "#5DA0D6", // info
  "#E0432B", // danger
  "#E8A22B", // warning
];
const ARCHETYPES: FighterArchetype[] = [
  "roaster",
  "debater",
  "philosopher",
  "troll",
  "scholar",
  "provocateur",
];
const TAG_POOLS = [
  ["english", "shortform", "surgical"],
  ["structured", "precedent", "calm"],
  ["firstprinciples", "longform"],
  ["degen", "chaos", "rugproof"],
  ["citations", "precedent", "archive"],
  ["surgical", "shortfuse"],
];

function hashU32(input: string): number {
  const h = keccak256(toHex(input));
  return Number(BigInt(h.slice(0, 10))); // first 4 bytes as uint
}

export interface OnChainFighterStats {
  elo: number;
  wins: number;
  losses: number;
  earnings: number;
}

export interface OnChainFighterCore {
  tokenId: bigint;
  owner: Address;
  metadataHash: `0x${string}`;
  encryptedURI: string;
}

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

/**
 * Adapt raw contract reads into the rich `Fighter` UI shape.
 *
 * Some fields (name, color, tags, archetype) have no on-chain source and
 * are synthesized deterministically from the tokenId + metadataHash so the
 * UI stays stable across renders.
 *
 * Combat traits (HP / Logic / Wit) use a **hybrid** model:
 *   base (synthesized per-fighter) + real modifier (from on-chain stats)
 * so fighters start distinct at mint time but the trait sheet actually
 * shifts as they battle. Modifiers are intentionally small (~±10) so no
 * single battle swings a trait wildly — growth is earned over time.
 *
 * - HP       = defensive resilience  → base + (winRate − 0.5) × 20
 * - Logic    = argument skill        → base + (ELO − 1200) / 15
 * - Wit      = quick thinking        → base + min(10, battles × 1.5)
 */
export function adaptFighter(
  core: OnChainFighterCore,
  stats: OnChainFighterStats,
): Fighter {
  const id = Number(core.tokenId);
  const seed = hashU32(`${core.tokenId}:${core.metadataHash}`);
  const color = PALETTE[seed % PALETTE.length];
  const arch = ARCHETYPES[seed % ARCHETYPES.length];
  const tags = TAG_POOLS[seed % TAG_POOLS.length];

  const battles = stats.wins + stats.losses;
  const winRate = battles > 0 ? stats.wins / battles : 0.5;
  const elo = stats.elo || 1200;

  const baseHp = 60 + (seed % 40);
  const baseLogic = 55 + ((seed >> 3) % 40);
  const baseWit = 55 + ((seed >> 6) % 40);

  const hp = clamp(0, 100, Math.round(baseHp + (winRate - 0.5) * 20));
  const logic = clamp(0, 100, Math.round(baseLogic + (elo - 1200) / 15));
  const wit = clamp(0, 100, Math.round(baseWit + Math.min(10, battles * 1.5)));

  return {
    id,
    name: `Fighter #${id}`,
    arch,
    elo,
    w: stats.wins,
    l: stats.losses,
    earnings: stats.earnings,
    owner: core.owner,
    forSale: false,
    forRent: false,
    color,
    hp,
    logic,
    wit,
    tags,
    battles,
    attest: core.metadataHash,
  };
}

// BattleEscrow.Status enum → our string status. `Live` without verdict we treat
// as "live"; Pending is "upcoming"; Verdict/Settled are "past".
export function mapBattleStatus(onChainStatus: number): BattleStatus {
  switch (onChainStatus) {
    case 0: // Pending
      return "upcoming";
    case 1: // Live
      return "live";
    case 2: // Verdict
    case 3: // Settled
    case 4: // Cancelled
      return "past";
    default:
      return "upcoming";
  }
}

export interface OnChainBattleRaw {
  fighterA: bigint;
  fighterB: bigint;
  creator: Address;
  startTime: bigint;
  verdictTime: bigint;
  maxRounds: number;
  winner: number;
  status: number;
  poolA: bigint;
  poolB: bigint;
  feeCollected: bigint;
  topic: string;
  verdictSig: `0x${string}`;
}

const ONEG = 1e18;

/**
 * Pari-mutuel odds: payout per unit if side wins = total pool / winner pool.
 * Before any bets are placed on a side, we default to 1.00×.
 */
function computeOdds(poolA: bigint, poolB: bigint): { oddsA: number; oddsB: number } {
  const total = poolA + poolB;
  const aNum = Number(poolA) / ONEG;
  const bNum = Number(poolB) / ONEG;
  const tNum = Number(total) / ONEG;
  return {
    oddsA: aNum > 0 ? +(tNum / aNum).toFixed(2) : 1,
    oddsB: bNum > 0 ? +(tNum / bNum).toFixed(2) : 1,
  };
}

export function adaptBattle(
  id: bigint,
  raw: OnChainBattleRaw,
  roundsRecorded = 0,
  spectators = 0,
): Battle {
  const status = mapBattleStatus(raw.status);
  const { oddsA, oddsB } = computeOdds(raw.poolA, raw.poolB);
  const pool = Number(raw.poolA + raw.poolB) / ONEG;
  const isPast = status === "past";
  const winner = raw.winner === 0 ? "a" : raw.winner === 1 ? "b" : undefined;

  return {
    id: `b-${id.toString(16).padStart(4, "0")}`,
    status,
    round: roundsRecorded,
    maxRound: raw.maxRounds,
    topic: raw.topic,
    a: Number(raw.fighterA),
    b: Number(raw.fighterB),
    pool,
    spectators,
    endsIn: null,
    startedAt: raw.startTime > 0n ? Number(raw.startTime) * 1000 : null,
    oddsA,
    oddsB,
    winner: isPast && raw.winner !== 2 ? winner : undefined,
    endedAt:
      raw.verdictTime > 0n && isPast ? Number(raw.verdictTime) * 1000 : undefined,
  };
}

// Battle ids in the UI are `b-<hex>`. Convert back to the numeric id.
export function parseBattleId(uiId: string): bigint | null {
  const m = uiId.match(/^b-([0-9a-fA-F]+)$/);
  if (!m) return null;
  try {
    return BigInt(`0x${m[1]}`);
  } catch {
    return null;
  }
}
