"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { CardSkel } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { PageContainer } from "@/components/shell/page-container";
import { useBattles } from "@/hooks/use-battles";
import { openConnectPanel, useWallet } from "@/hooks/use-wallet";
import type { BattleStatus } from "@/lib/types";
import { BattleCard } from "./battle-card";

type SortKey = "pool" | "spectators";

export default function ArenasPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const [tab, setTab] = useState<BattleStatus>("live");
  const [sort, setSort] = useState<SortKey>("pool");
  const [q, setQ] = useState("");

  const { data: allBattles, isLoading } = useBattles({ limit: 128 });

  const counts = {
    live: allBattles.filter((b) => b.status === "live").length,
    upcoming: allBattles.filter((b) => b.status === "upcoming").length,
    past: allBattles.filter((b) => b.status === "past").length,
  };

  const filtered = allBattles
    .filter((b) => b.status === tab)
    .filter((b) => !q || b.topic.toLowerCase().includes(q.toLowerCase()));
  const sorted = [...filtered].sort((a, b) =>
    sort === "pool" ? b.pool - a.pool : (b.spectators ?? 0) - (a.spectators ?? 0),
  );

  const startCreate = () => {
    if (connected) router.push("/battle/new");
    else openConnectPanel({ context: "Create a new battle" });
  };

  return (
    <PageContainer>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, letterSpacing: "-0.01em", marginBottom: 4 }}>Arenas</h1>
          <div style={{ fontSize: 13, color: "var(--tx-secondary)" }}>
            Browse live and upcoming battles.
          </div>
        </div>
        <Button variant="primary" leading={<Icon name="plus" size={14} />} onClick={startCreate}>
          Create battle
        </Button>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as BattleStatus)}
        tabs={[
          { value: "live", label: "Live", count: counts.live },
          { value: "upcoming", label: "Upcoming", count: counts.upcoming },
          { value: "past", label: "Past", count: counts.past },
        ]}
        style={{ marginBottom: 20 }}
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <Input
          leading={<Icon name="search" size={14} />}
          placeholder="Search topics"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          containerStyle={{ flex: 1, maxWidth: 360 }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {(["pool", "spectators"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              style={{
                padding: "0 12px",
                height: 34,
                fontSize: 12,
                background: sort === k ? "var(--bg-surface)" : "transparent",
                border: "1px solid var(--bd-default)",
                borderRadius: 4,
                color: sort === k ? "var(--tx-primary)" : "var(--tx-secondary)",
              }}
            >
              {k === "pool" ? "Pool size" : "Watchers"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkel key={i} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title={tab === "live" ? "No live battles yet" : tab === "upcoming" ? "Nothing scheduled" : "No past battles"}
          body={
            tab === "live"
              ? "Create the first battle to get things started."
              : "Check back once battles start or wrap."
          }
          cta={
            tab !== "past" ? (
              <Button variant="primary" onClick={startCreate}>
                Create battle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {sorted.map((b) => (
            <BattleCard key={b.id} battle={b} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
