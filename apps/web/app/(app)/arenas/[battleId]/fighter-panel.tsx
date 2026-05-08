"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HPBar } from "@/components/ui/hp-bar";
import { Icon } from "@/components/ui/icon";
import { Sigil } from "@/components/ui/sigil";
import { useSubname } from "@/hooks/use-subname";
import type { Fighter } from "@/lib/types";

export function FighterPanel({
  fighter,
  corner,
  compact = false,
}: {
  fighter: Fighter;
  corner: "a" | "b";
  compact?: boolean;
}) {
  const cornerColor = corner === "a" ? "var(--fighter-a)" : "var(--fighter-b)";
  const { fullName: subnameFullName } = useSubname(fighter.id);
  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Badge mono tone={corner}>
          {corner === "a" ? "Corner A" : "Corner B"}
        </Badge>
        <span className="label mono" style={{ fontSize: 10 }}>
          INFT #{fighter.id}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Sigil seed={fighter.name} size={64} color={cornerColor} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {fighter.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-tertiary)", textTransform: "capitalize" }}>
            {fighter.arch}
          </div>
          {subnameFullName && (
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--accent)",
                marginTop: 4,
                letterSpacing: 0.04,
              }}
            >
              {subnameFullName}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div className="label" style={{ marginBottom: 2 }}>ELO</div>
          <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{fighter.elo}</div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 2 }}>Record</div>
          <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
            {fighter.w}–{fighter.l}
          </div>
        </div>
      </div>
      <HPBar label="HP" value={fighter.hp} showText color={cornerColor} />
      {!compact && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <HPBar label="Logic" value={fighter.logic} color="var(--tx-secondary)" />
            <HPBar label="Wit" value={fighter.wit} color="var(--tx-secondary)" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {fighter.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </>
      )}
      <Link
        href={`/fighters/${fighter.id}`}
        style={{
          fontSize: 12,
          color: "var(--tx-secondary)",
          textAlign: "left",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: "auto",
        }}
      >
        View fighter <Icon name="arrowRight" size={12} />
      </Link>
    </Card>
  );
}
