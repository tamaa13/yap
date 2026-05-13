// Archetype → ability-unlock metadata. Centralized so the mint picker,
// the pre-battle ability indicator (Phase 8), and any future archetype
// surface read from one source. yap-contracts canonicalizes the same
// thresholds on-chain via AbilityEscrow.useAbility() trait gates.

import type { FighterArchetype } from "./types";

export type ScoreDimension =
  | "logos"
  | "rhetoric"
  | "aggression"
  | "range"
  | "concreteness";

/** Trait-index ordering matches `YapFighter.recordMintScores`' packed
 *  bytes5 layout AND `AbilityEscrow.requiredScore(archetype)`'s
 *  returned `traitIdx`. Two on-chain surfaces depend on this mapping,
 *  so keep this object + TRAIT_DIMENSION_BY_INDEX in sync if either
 *  contract changes. */
export const TRAIT_INDEX: Record<ScoreDimension, 0 | 1 | 2 | 3 | 4> = {
  logos: 0,
  rhetoric: 1,
  aggression: 2,
  range: 3,
  concreteness: 4,
};
export const TRAIT_DIMENSION_BY_INDEX: readonly ScoreDimension[] = [
  "logos",
  "rhetoric",
  "aggression",
  "range",
  "concreteness",
];

/** Archetype → uint8 mapping used by YapFighter / AbilityEscrow. Index
 *  is the on-chain archetype id (`useAbility`, `requiredScore` accept
 *  this value as their `archetype` argument). */
export const ARCHETYPE_INDEX: Record<FighterArchetype, 0 | 1 | 2 | 3 | 4 | 5> = {
  roaster: 0,
  debater: 1,
  philosopher: 2,
  troll: 3,
  scholar: 4,
  provocateur: 5,
};

export interface ArchetypeMeta {
  id: FighterArchetype;
  name: string;
  /** Short marketing line shown on the picker tile. */
  blurb: string;
  /** Trait dimension this archetype scales with. Used for the
   *  "Recommended" pill on the picker when the user's top score
   *  matches this. */
  primaryTrait: ScoreDimension;
  /** Ability name (Phase 8 will render this on the in-battle panel). */
  abilityName: string;
  /** One-line ability description shown on the mint picker tile. */
  abilityBlurb: string;
  /** Trait dimension that must clear `abilityMinScore` for the ability
   *  to unlock at mint time. Picking the archetype is always allowed
   *  (strategic mismatch is a valid choice), but the ability stays
   *  locked when the trait gate isn't met. */
  abilityGate: { dimension: ScoreDimension; minScore: 1 | 2 | 3 | 4 | 5 };
}

export const ARCHETYPE_META: Record<FighterArchetype, ArchetypeMeta> = {
  roaster: {
    id: "roaster",
    name: "Roaster",
    blurb: "Burns quickly, burns bright.",
    primaryTrait: "aggression",
    abilityName: "Mic Drop",
    abilityBlurb: "Double damage on the next round you win.",
    abilityGate: { dimension: "aggression", minScore: 3 },
  },
  debater: {
    id: "debater",
    name: "Debater",
    blurb: "Structured argument, surgical rebuttals.",
    primaryTrait: "logos",
    abilityName: "Counterpoint",
    abilityBlurb: "See opponent's argument before crafting your reply.",
    abilityGate: { dimension: "logos", minScore: 3 },
  },
  philosopher: {
    id: "philosopher",
    name: "Philosopher",
    blurb: "First principles, long horizons.",
    primaryTrait: "logos",
    abilityName: "Reframe",
    abilityBlurb: "Pivot the topic — opponent argues your new angle.",
    abilityGate: { dimension: "logos", minScore: 4 },
  },
  troll: {
    id: "troll",
    name: "Troll",
    blurb: "Unpredictable, derails the opponent.",
    primaryTrait: "aggression",
    abilityName: "Derail",
    abilityBlurb: "Cap opponent's next round at 50 tokens.",
    abilityGate: { dimension: "aggression", minScore: 4 },
  },
  scholar: {
    id: "scholar",
    name: "Scholar",
    blurb: "Citation-heavy, precedent-driven.",
    primaryTrait: "range",
    abilityName: "Cite Precedent",
    abilityBlurb: "Append a past-battle excerpt for evidence.",
    abilityGate: { dimension: "range", minScore: 3 },
  },
  provocateur: {
    id: "provocateur",
    name: "Provocateur",
    blurb: "Goads with calculated edges.",
    primaryTrait: "rhetoric",
    abilityName: "Bait",
    abilityBlurb: "Inject a prompt modifier onto your opponent.",
    abilityGate: { dimension: "rhetoric", minScore: 3 },
  },
};

export const ARCHETYPE_LIST: readonly FighterArchetype[] = [
  "roaster",
  "debater",
  "philosopher",
  "troll",
  "scholar",
  "provocateur",
];

/** True iff the seed's trait score on this archetype's gate dimension
 *  meets the unlock threshold. */
export function isAbilityUnlocked(
  archetype: FighterArchetype,
  scores: Record<ScoreDimension, number>,
): boolean {
  const meta = ARCHETYPE_META[archetype];
  return scores[meta.abilityGate.dimension] >= meta.abilityGate.minScore;
}

/** Pick the archetype whose primary trait scored highest on the seed.
 *  Ties broken in ARCHETYPE_LIST order so "Roaster" wins over "Troll"
 *  on equal Aggression — first-declared is the more general archetype. */
export function recommendArchetype(
  scores: Record<ScoreDimension, number>,
): FighterArchetype {
  let best: FighterArchetype = ARCHETYPE_LIST[0];
  let bestScore = -Infinity;
  for (const arch of ARCHETYPE_LIST) {
    const meta = ARCHETYPE_META[arch];
    const score = scores[meta.primaryTrait];
    if (score > bestScore) {
      bestScore = score;
      best = arch;
    }
  }
  return best;
}
