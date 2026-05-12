"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { RecordBadge, TokenTag } from "@/components/ui/badge";
import { Sigil } from "@/components/ui/sigil";
import { useLeaderboard } from "@/hooks/use-leaderboard";

export function LandingTopFighters() {
  const { data: top } = useLeaderboard({ metric: "elo", limit: 4 });

  if (top.length === 0) {
    return (
      <div
        style={{
          padding: "28px 20px",
          border: "1px dashed var(--yap-ink-500)",
          fontSize: 13,
          color: "var(--yap-ink-200)",
          textAlign: "center",
          background: "var(--yap-ink-800)",
        }}
      >
        Leaderboard forming.{" "}
        <Link href="/mint" style={{ color: "var(--yap-crimson)" }}>
          Be the first fighter.
        </Link>
      </div>
    );
  }

  return (
    <div
      className="al-stats-grid-4"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
      }}
    >
      {top.map((f, i) => (
        <Link key={f.id} href={`/fighters/${f.id}`}>
          <Card interactive style={{ padding: 18 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 14,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: 2,
                  color: "var(--yap-ink-400)",
                  textTransform: "uppercase",
                }}
              >
                #{String(i + 1).padStart(2, "0")}
              </span>
              <TokenTag>#{f.id}</TokenTag>
            </div>
            <Sigil
              seed={f.name}
              size={72}
              color={i % 2 === 0 ? "var(--yap-crimson)" : "var(--yap-gold)"}
            />
            <div
              style={{
                fontFamily: "var(--yap-font-display)",
                fontWeight: 400,
                fontSize: 26,
                lineHeight: 0.95,
                marginTop: 14,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--yap-ink-50)",
              }}
            >
              {f.name}
            </div>
            <div
              style={{
                fontFamily: "var(--yap-font-display-2)",
                fontSize: 13,
                color: "var(--yap-ink-300)",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginTop: 4,
                marginBottom: 12,
              }}
            >
              {f.arch}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 10,
                borderTop: "1px solid var(--yap-ink-700)",
              }}
            >
              <RecordBadge w={f.w} l={f.l} size="sm" />
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--yap-ink-200)",
                }}
              >
                <span style={{ color: "var(--yap-ink-400)" }}>ELO </span>
                {f.elo}
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
