"use client";

import Link from "next/link";
import { AbilityChip } from "@/components/ui/ability-chip";
import { Card } from "@/components/ui/card";
import { RecordBadge, Split, Stamp, TokenTag } from "@/components/ui/badge";
import { HPBar } from "@/components/ui/hp-bar";
import { Icon } from "@/components/ui/icon";
import { Sigil } from "@/components/ui/sigil";
import { useSubname } from "@/hooks/use-subname";
import type { Fighter } from "@/lib/types";

export function FighterPanel({
  fighter,
  corner,
  compact = false,
  liveHp,
  battleId,
  round,
  isController,
}: {
  fighter: Fighter;
  corner: "a" | "b";
  compact?: boolean;
  /** When provided, overrides fighter.hp with the in-battle morale value
   *  (depletes per round). Reputation HP shown on the fighter card stays
   *  unchanged; this is just the live arena view. */
  liveHp?: number;
  /** When passed alongside `round` + `isController`, the AbilityChip
   *  mounts its in-battle CTA wired to AbilityEscrow.useAbility().
   *  Spectator surfaces leave these undefined and get the read-only
   *  chip. */
  battleId?: number;
  round?: number;
  isController?: boolean;
}) {
  const cornerColor =
    corner === "a" ? "var(--yap-crimson)" : "var(--yap-gold)";
  const { fullName: subnameFullName } = useSubname(fighter.id);
  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Stamp tone={corner === "a" ? "default" : "gold"}>
          {corner === "a" ? "Corner A" : "Corner B"}
        </Stamp>
        <TokenTag>#{fighter.id}</TokenTag>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <Sigil seed={fighter.name} size={64} color={cornerColor} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--yap-font-display)",
              fontWeight: 400,
              fontSize: 24,
              lineHeight: 0.95,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--yap-ink-50)",
            }}
          >
            {fighter.name}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--yap-ink-300)",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            {fighter.arch}
          </div>
          {subnameFullName && (
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: cornerColor,
                marginTop: 4,
                letterSpacing: 0.04,
              }}
            >
              {subnameFullName}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <RecordBadge w={fighter.w} l={fighter.l} size="sm" />
        <Split k="ELO" v={fighter.elo} size="sm" />
      </div>
      <HPBar
        label="HP"
        value={typeof liveHp === "number" ? liveHp : fighter.hp}
        showText
        color={cornerColor}
      />
      {!compact && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <HPBar label="LGC" value={fighter.logic} color="var(--yap-info)" />
            <HPBar label="WIT" value={fighter.wit} color="var(--yap-warning)" />
          </div>
          {/* Archetype ability indicator. CTA mounts when battle context
           *  is supplied AND viewer iControls this side; otherwise the
           *  chip stays read-only (spectators, opposing side owner). */}
          <AbilityChip
            fighter={fighter}
            compact
            battleId={battleId}
            side={corner}
            round={round}
            isController={isController}
          />
          {fighter.tags.length > 0 && (
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: "var(--yap-ink-400)",
                lineHeight: 1.5,
              }}
            >
              {fighter.tags.join(" · ")}
            </div>
          )}
        </>
      )}
      <Link
        href={`/fighters/${fighter.id}`}
        style={{
          fontFamily: "var(--yap-font-display-2)",
          fontSize: 14,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--yap-ink-300)",
          textAlign: "left",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: "auto",
        }}
      >
        Fighter card <Icon name="arrowRight" size={12} />
      </Link>
    </Card>
  );
}
