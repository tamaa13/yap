"use client";

import { useState } from "react";
import {
  ARCHETYPE_META,
  isAbilityUnlocked,
  type ScoreDimension,
} from "@/lib/archetype-meta";
import {
  useAbilityUsed,
  useFighterTraits,
  useUseAbility,
} from "@/hooks/use-ability";
import { mockScoresFromFighter } from "@/lib/stylometry/fighter-mock-scores";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Fighter, FighterArchetype } from "@/lib/types";

const DIMENSION_LABEL: Record<ScoreDimension, string> = {
  logos: "Logos",
  rhetoric: "Rhetoric",
  aggression: "Aggression",
  range: "Range",
  concreteness: "Concrete",
};

/**
 * Archetype-ability indicator + (optional) in-battle CTA.
 *
 * Default (read-only) mode: ability name + ✓/✗ unlock pill + gate
 * dimension `current/required`. Shown on every surface that renders
 * a fighter (vault, profile, pre-battle, in-battle).
 *
 * In-battle interactive mode: when `battleId`, `side`, `round`, and
 * `isController` are all supplied, the chip mounts a "Use ability"
 * CTA wired to `AbilityEscrow.useAbility(battleId, side, round)` via
 * the runner wallet. The button:
 *   - polls `isAbilityUsed(battleId, side)` to flip to "Used" after
 *     a successful tx
 *   - locks while the trait gate isn't met (mirrors the contract's
 *     `requiredScore` check — contract verifies again on tx)
 *   - hides for spectators and the opposing-side owner (iControl)
 *
 * Trait source: prefers `useFighterTraits(tokenId)` (on-chain). Falls
 * back to `mockScoresFromFighter` when the contract hasn't shipped
 * the `getTraits` getter or returns null mid-rebuild. The fallback
 * keeps every pre-battle surface working off existing hp/logic/wit
 * until Phase 6 propagates real on-chain reads everywhere.
 */
export interface AbilityChipProps {
  fighter: Fighter;
  /** Defaults to `fighter.arch`. Mint picker overrides this to preview
   *  each archetype against the same scored seed. */
  archetype?: FighterArchetype;
  /** Strips the description line — tight surfaces only. */
  compact?: boolean;
  /** When set with `side` + `round` + `isController`, mounts the in-
   *  battle CTA. Missing any → read-only display mode. */
  battleId?: number | bigint;
  side?: "a" | "b";
  round?: number;
  /** True when the current viewer iControls this fighter — gates the
   *  CTA the same way the stance prompt is gated. */
  isController?: boolean;
}

export function AbilityChip(props: AbilityChipProps) {
  const { fighter, archetype, compact = false } = props;
  const archId = archetype ?? (fighter.arch as FighterArchetype);
  const meta = ARCHETYPE_META[archId];
  // Always call hooks unconditionally — React rules-of-hooks. We pass
  // a falsy id when the chip is read-only so the hook no-ops via its
  // own `enabled` gate.
  const onChainTraits = useFighterTraits(meta ? fighter.id : null);
  const ability = useUseAbility();
  const abilityUsed = useAbilityUsed(
    props.battleId ?? null,
    props.side ?? null,
  );
  const { push } = useToast();
  const [optimisticUsed, setOptimisticUsed] = useState(false);
  if (!meta) return null;

  const scores =
    onChainTraits.data ??
    (mockScoresFromFighter(fighter) as Record<ScoreDimension, number>);
  const unlocked = isAbilityUnlocked(archId, scores);
  const userScore = scores[meta.abilityGate.dimension];

  // Interactive mode requires every input set. We *can't* short-circuit
  // before the hook calls above — React would complain on the next
  // render when one of the props flips back to defined.
  const interactive =
    props.battleId !== undefined &&
    props.side !== undefined &&
    props.round !== undefined &&
    !!props.isController;

  const used = optimisticUsed || abilityUsed.used;
  const busy = ability.isPending || ability.isConfirming;
  const canFire = interactive && unlocked && !used && !busy;

  const onFire = async () => {
    if (!props.battleId || !props.side || props.round === undefined) return;
    try {
      const tx = await ability.fire(props.battleId, props.side, props.round);
      setOptimisticUsed(true);
      push({
        kind: "success",
        text: `${meta.abilityName} fired · tx ${tx.slice(0, 10)}…`,
      });
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : `${meta.abilityName} failed`,
      });
    }
  };

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
            background: used
              ? "color-mix(in srgb, var(--accent) 22%, transparent)"
              : unlocked
                ? "color-mix(in srgb, var(--success) 18%, transparent)"
                : "color-mix(in srgb, var(--tx-tertiary) 15%, transparent)",
            color: used
              ? "var(--accent)"
              : unlocked
                ? "var(--success)"
                : "var(--tx-tertiary)",
            letterSpacing: 1,
            textTransform: "uppercase",
            borderRadius: 2,
            whiteSpace: "nowrap",
          }}
        >
          {used ? "✓ used" : unlocked ? "✓ unlocked" : "✗ locked"}
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
      {interactive && (
        <Button
          size="sm"
          variant={canFire ? "primary" : "secondary"}
          disabled={!canFire}
          onClick={onFire}
          leading={<Icon name="zap" size={12} />}
          style={{ marginTop: 6 }}
        >
          {used
            ? "Fired this battle"
            : busy
              ? "Sending…"
              : unlocked
                ? `Fire ${meta.abilityName}`
                : "Gate not met"}
        </Button>
      )}
    </div>
  );
}
