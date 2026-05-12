// Bridge helper: derive a Phase-3-shaped 5-tuple from the existing
// `Fighter` shape (hp / logic / wit). Used by the in-battle ability
// indicator + any pre-Phase-6 surface that wants to render the new
// trait system before YapFighter actually exposes the score fields.
//
// Phase 6 replaces this helper with a hook (`useFighterScores(tokenId)`)
// that reads the real trait values committed at mint time via
// `recordMintScores`. Call sites stay structurally identical — the
// return shape is the same `Record<ScoreDimension, ScoreFive>`.

import type { Fighter } from "@/lib/types";
import type { ScoreFive } from "./mock-scores";
import type { ScoreDimension } from "@/lib/archetype-meta";

function clamp(n: number): ScoreFive {
  const r = Math.round(n);
  if (r <= 1) return 1;
  if (r >= 5) return 5;
  return r as ScoreFive;
}

/**
 * Map (hp, logic, wit) → 5-tuple. Each existing trait maps to a band
 * (1–5) using a 20-unit step (0–19 → 1, 20–39 → 2, …, 80+ → 5), then
 * dispatches into the new dimensions with mild blending so each new
 * trait has a unique source.
 *
 * Concrete mapping:
 *   logos        ← logic
 *   rhetoric     ← wit
 *   aggression   ← weighted(wit, 100-hp) — high-Wit low-HP plays aggro
 *   range        ← hp           (proxy for vocabulary breadth — Wit
 *                                 already takes Rhetoric, Logic already
 *                                 takes Logos; HP is the unused leg)
 *   concreteness ← (hp + logic) / 2  (mixed signal)
 */
export function mockScoresFromFighter(
  fighter: Fighter,
): Record<ScoreDimension, ScoreFive> {
  const stepBand = (n: number) => clamp(1 + Math.floor(n / 20));
  return {
    logos: stepBand(fighter.logic),
    rhetoric: stepBand(fighter.wit),
    aggression: stepBand(fighter.wit * 0.5 + (100 - fighter.hp) * 0.5),
    range: stepBand(fighter.hp),
    concreteness: stepBand((fighter.hp + fighter.logic) / 2),
  };
}
