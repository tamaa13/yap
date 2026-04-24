"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { LiveDot } from "@/components/ui/live-dot";
import { Sigil } from "@/components/ui/sigil";
import { useFighter } from "@/hooks/use-fighter";
import { fmtNum, fmtTime } from "@/lib/format";
import type { Battle } from "@/lib/types";

export function BattleCard({ battle }: { battle: Battle }) {
  const router = useRouter();
  const { data: fA } = useFighter(battle.a);
  const { data: fB } = useFighter(battle.b);

  const isLive = battle.status === "live";
  const isUpcoming = battle.status === "upcoming";
  const nameA = fA?.name ?? `Fighter #${battle.a}`;
  const nameB = fB?.name ?? `Fighter #${battle.b}`;

  return (
    <Card
      interactive
      onClick={() =>
        router.push(
          battle.status === "past" ? `/arenas/${battle.id}/result` : `/arenas/${battle.id}`,
        )
      }
      style={{ padding: 16 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {isLive && (
          <>
            <LiveDot />
            <span className="label" style={{ color: "var(--live)" }}>Live</span>
          </>
        )}
        {isUpcoming && (
          <>
            <Icon name="clock" size={12} style={{ color: "var(--warning)" }} />
            <span className="label" style={{ color: "var(--warning)" }}>
              Pending acceptance
            </span>
          </>
        )}
        {battle.status === "past" && (
          <>
            <Icon name="check" size={12} style={{ color: "var(--success)" }} />
            <span className="label" style={{ color: "var(--success)" }}>Settled</span>
          </>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--tx-tertiary)",
          }}
        >
          {battle.status === "past" && battle.endedAt
            ? fmtTime(battle.endedAt)
            : `R${battle.round}/${battle.maxRound}`}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.4,
          minHeight: 40,
          marginBottom: 14,
          color: "var(--tx-primary)",
        }}
      >
        {battle.topic}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sigil seed={nameA} size={32} color="var(--fighter-a)" />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {nameA}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--tx-tertiary)" }}>
              {battle.oddsA.toFixed(2)}x
            </div>
          </div>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--tx-tertiary)" }}>
          vs
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <div style={{ minWidth: 0, textAlign: "right" }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {nameB}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--tx-tertiary)" }}>
              {battle.oddsB.toFixed(2)}x
            </div>
          </div>
          <Sigil seed={nameB} size={32} color="var(--fighter-b)" />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--tx-tertiary)",
          paddingTop: 10,
          borderTop: "1px solid var(--bd-subtle)",
        }}
      >
        <span>{fmtNum(battle.pool)} 0G pool</span>
        <span>{fmtNum(battle.spectators)} watching</span>
      </div>
    </Card>
  );
}
