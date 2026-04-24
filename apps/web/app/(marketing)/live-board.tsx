"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { LiveDot } from "@/components/ui/live-dot";
import { Sigil } from "@/components/ui/sigil";
import { useBattles } from "@/hooks/use-battles";
import { useFighter } from "@/hooks/use-fighter";
import { fmtNum } from "@/lib/format";
import type { Battle } from "@/lib/types";

export function LandingLiveBoard() {
  const { data: battles } = useBattles({ status: "live", limit: 3 });
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (battles.length === 0) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % battles.length), 4500);
    return () => clearInterval(t);
  }, [battles.length]);

  if (battles.length === 0) {
    return (
      <div
        style={{
          marginTop: 56,
          padding: "28px 20px",
          border: "1px dashed var(--bd-default)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--tx-secondary)",
          textAlign: "center",
        }}
      >
        No live battles yet. <Link href="/battle/new" style={{ color: "var(--accent)" }}>Create the first one.</Link>
      </div>
    );
  }

  return (
    <div
      className="al-stats-grid-3"
      style={{
        marginTop: 56,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
      }}
    >
      {battles.map((b, i) => (
        <LiveBoardCard key={b.id} battle={b} active={i === idx} />
      ))}
    </div>
  );
}

function LiveBoardCard({ battle, active }: { battle: Battle; active: boolean }) {
  const { data: fA } = useFighter(battle.a);
  const { data: fB } = useFighter(battle.b);
  const nameA = fA?.name ?? `Fighter #${battle.a}`;
  const nameB = fB?.name ?? `Fighter #${battle.b}`;

  return (
    <Link href={`/arenas/${battle.id}`}>
      <Card
        interactive
        style={{
          padding: 14,
          opacity: active ? 1 : 0.75,
          transition: "opacity 400ms",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <LiveDot />
          <span className="label" style={{ color: "var(--live)" }}>Live</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--tx-tertiary)",
            }}
          >
            R{battle.round}/{battle.maxRound}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            marginBottom: 10,
            color: "var(--tx-primary)",
            lineHeight: 1.4,
            minHeight: 36,
          }}
        >
          {battle.topic}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Sigil seed={nameA} size={22} color="var(--fighter-a)" />
            <span style={{ fontSize: 12 }}>{nameA}</span>
            <span style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>vs</span>
            <Sigil seed={nameB} size={22} color="var(--fighter-b)" />
            <span style={{ fontSize: 12 }}>{nameB}</span>
          </div>
          <span className="num" style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>
            {fmtNum(battle.pool)} 0G
          </span>
        </div>
      </Card>
    </Link>
  );
}
