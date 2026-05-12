"use client";

import {
  ARCHETYPE_META,
  isAbilityUnlocked,
  type ScoreDimension,
} from "@/lib/archetype-meta";
import { mockScoresFromFighter } from "@/lib/stylometry/fighter-mock-scores";
import type { Fighter, FighterArchetype } from "@/lib/types";

const DIMENSION_LABEL: Record<ScoreDimension, string> = {
  logos: "Logos",
  rhetoric: "Rhetoric",
  aggression: "Aggression",
  range: "Range",
  concreteness: "Concrete",
};

/**
 * Compact ability indicator for any surface that renders a fighter.
 * Shows {AbilityName · ✓ unlocked / ✗ locked} plus the trait gate that
 * unlocks it (e.g. `Aggression 4/3`). Read-only — Phase 8 final adds
 * a "Use ability" CTA wired to AbilityEscrow.useAbility() for the
 * in-battle surface.
 *
 * Reads the mocked 5-tuple from `mockScoresFromFighter` until Phase 6
 * swaps to real on-chain trait reads. Component API stays the same.
 */
export function AbilityChip({
  fighter,
  archetype,
  compact = false,
}: {
  fighter: Fighter;
  /** Defaults to `fighter.arch`. Pre-mint surfaces (the mint picker)
   *  override this to preview each archetype against the current
   *  scored seed. */
  archetype?: FighterArchetype;
  /** Strips the gate line — useful in tight spots like the
   *  arena-pending fighter column where vertical real estate is tight. */
  compact?: boolean;
}) {
  const archId = archetype ?? (fighter.arch as FighterArchetype);
  const meta = ARCHETYPE_META[archId];
  if (!meta) return null;
  const scores = mockScoresFromFighter(fighter);
  const unlocked = isAbilityUnlocked(archId, scores);
  const userScore = scores[meta.abilityGate.dimension];

  return (
    <div
      style={{
        padding: compact ? "6px 10px" : "10px 12px",
        background: "var(--bg-sunken)",
        border: `1px solid ${unlocked ? "var(--accent-border)" : "var(--bd-default)"}`,
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: unlocked ? "var(--accent)" : "var(--tx-tertiary)",
          }}
        >
          {meta.abilityName}
        </div>
        <span
          className="mono"
          style={{
            fontSize: 9,
            padding: "1px 5px",
            background: unlocked
              ? "color-mix(in srgb, var(--success) 18%, transparent)"
              : "color-mix(in srgb, var(--tx-tertiary) 15%, transparent)",
            color: unlocked ? "var(--success)" : "var(--tx-tertiary)",
            letterSpacing: 1,
            textTransform: "uppercase",
            borderRadius: 2,
            whiteSpace: "nowrap",
          }}
        >
          {unlocked ? "✓ unlocked" : "✗ locked"}
        </span>
      </div>
      {!compact && (
        <div
          style={{
            fontSize: 11,
            color: "var(--tx-secondary)",
            lineHeight: 1.4,
          }}
        >
          {meta.abilityBlurb}
        </div>
      )}
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: unlocked ? "var(--tx-tertiary)" : "var(--danger)",
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        Gate · {DIMENSION_LABEL[meta.abilityGate.dimension]} {userScore}/
        {meta.abilityGate.minScore}
      </div>
    </div>
  );
}
