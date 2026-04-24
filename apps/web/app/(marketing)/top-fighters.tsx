"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Sigil } from "@/components/ui/sigil";
import { useLeaderboard } from "@/hooks/use-leaderboard";

export function LandingTopFighters() {
  const { data } = useLeaderboard("elo");
  const top = data.slice(0, 4);

  if (top.length === 0) {
    return (
      <div
        style={{
          padding: "28px 20px",
          border: "1px dashed var(--bd-default)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--tx-secondary)",
          textAlign: "center",
        }}
      >
        Leaderboard forming. <Link href="/mint" style={{ color: "var(--accent)" }}>Be the first fighter.</Link>
      </div>
    );
  }

  return (
    <div
      className="al-stats-grid-4"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}
    >
      {top.map((f, i) => (
        <Link key={f.id} href={`/fighters/${f.id}`}>
          <Card interactive style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>
                #{i + 1}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
                {f.elo}
              </span>
            </div>
            <Sigil seed={f.name} size={56} color={f.color} />
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>{f.name}</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tx-tertiary)",
                textTransform: "capitalize",
              }}
            >
              {f.arch}
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 10,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--tx-secondary)",
              }}
            >
              <span>{f.w}W</span>
              <span>{f.l}L</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
