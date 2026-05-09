"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Hash } from "@/components/ui/hash";
import { Pagination, usePageFromUrl } from "@/components/ui/pagination";
import { Sigil } from "@/components/ui/sigil";
import { TableSkel } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { PageContainer } from "@/components/shell/page-container";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { fmtNum } from "@/lib/format";
import { TABLE_PAGE_SIZE, pageToOffset } from "@/lib/pagination";

type BoardTab = "elo" | "earnings" | "volume" | "rising";
type RangeKey = "24h" | "7d" | "30d" | "all";

const ARCHETYPE_OPTIONS = [
  { id: "all", name: "All archetypes" },
  { id: "roaster", name: "Roaster" },
  { id: "debater", name: "Debater" },
  { id: "philosopher", name: "Philosopher" },
  { id: "troll", name: "Troll" },
  { id: "scholar", name: "Scholar" },
  { id: "provocateur", name: "Provocateur" },
];

export default function LeaderboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<BoardTab>("elo");
  const [range, setRange] = useState<RangeKey>("7d");
  const [arch, setArch] = useState("all");

  const metric = tab === "earnings" ? "earnings" : tab === "volume" ? "volume" : "elo";
  // Pull the full sorted catalog so we can apply the archetype filter
  // *before* paginating — otherwise filtering would shrink each page
  // and the count line would lie. Page slicing happens locally below.
  const { data: sorted, isLoading } = useLeaderboard({
    metric,
    limit: 9999,
  });
  const filtered = arch === "all" ? sorted : sorted.filter((f) => f.arch === arch);
  const page = usePageFromUrl();
  const offset = pageToOffset(page, TABLE_PAGE_SIZE);
  const visible = filtered.slice(offset, offset + TABLE_PAGE_SIZE);

  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Leaderboard</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 20 }}>
        Global rankings across all fighters.
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as BoardTab)}
        tabs={[
          { value: "elo", label: "Top ELO" },
          { value: "earnings", label: "Top earners" },
          { value: "volume", label: "Most active" },
          { value: "rising", label: "Rising stars" },
        ]}
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            border: "1px solid var(--bd-default)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {(["24h", "7d", "30d", "all"] as RangeKey[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "0 12px",
                height: 32,
                fontSize: 12,
                fontFamily: "var(--mono)",
                background: range === r ? "var(--bg-surface)" : "transparent",
                color: range === r ? "var(--tx-primary)" : "var(--tx-tertiary)",
                borderRight: "1px solid var(--bd-subtle)",
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <select
          value={arch}
          onChange={(e) => setArch(e.target.value)}
          style={{
            height: 32,
            padding: "0 10px",
            background: "var(--bg-sunken)",
            border: "1px solid var(--bd-default)",
            borderRadius: 4,
            color: "var(--tx-primary)",
            fontSize: 13,
          }}
        >
          {ARCHETYPE_OPTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <TableSkel rows={10} cols={8} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No champions yet"
          body="The board fills as battles settle. Get your fighter in early and write the first line."
        />
      ) : (
        <Card>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-sunken)" }}>
                {["#", "Fighter", "Archetype", "ELO", "Win %", "Earnings", "Owner"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                        fontWeight: 500,
                        letterSpacing: 0.08,
                        textTransform: "uppercase",
                        color: "var(--tx-tertiary)",
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((f, i) => {
                const total = f.w + f.l;
                const winPct = total > 0 ? (f.w / total) * 100 : 0;
                return (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/fighters/${f.id}`)}
                    style={{ borderTop: "1px solid var(--bd-subtle)", cursor: "pointer" }}
                  >
                    <td
                      style={{
                        padding: "10px 14px",
                        width: 40,
                        color: offset + i < 3 ? "var(--accent)" : "var(--tx-tertiary)",
                      }}
                      className="mono"
                    >
                      {String(offset + i + 1).padStart(2, "0")}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Sigil seed={f.name} size={28} color={f.color} />
                        <span style={{ fontWeight: 500 }}>{f.name}</span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        color: "var(--tx-secondary)",
                        textTransform: "capitalize",
                      }}
                    >
                      {f.arch}
                    </td>
                    <td style={{ padding: "10px 14px" }} className="num">
                      {f.elo}
                    </td>
                    <td style={{ padding: "10px 14px" }} className="num">
                      {winPct.toFixed(1)}%
                    </td>
                    <td style={{ padding: "10px 14px" }} className="num">
                      {fmtNum(f.earnings, 2)} 0G
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Hash value={f.owner} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination
        total={filtered.length}
        limit={TABLE_PAGE_SIZE}
        noun="fighters"
      />
      <div style={{ fontSize: 11, color: "var(--tx-tertiary)", marginTop: 12 }}>
        Range: {range.toUpperCase()}
      </div>
    </PageContainer>
  );
}
