"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Hash } from "@/components/ui/hash";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Sigil } from "@/components/ui/sigil";
import { FighterCardSkel } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { PageContainer } from "@/components/shell/page-container";
import { useFighters } from "@/hooks/use-fighters";
import type { FighterArchetype } from "@/lib/types";

type MarketTab = "buy" | "rent" | "auction";
type ViewMode = "grid" | "list";

const ARCHETYPES: Array<{ id: FighterArchetype; label: string }> = [
  { id: "roaster", label: "Roaster" },
  { id: "debater", label: "Debater" },
  { id: "philosopher", label: "Philosopher" },
  { id: "troll", label: "Troll" },
  { id: "scholar", label: "Scholar" },
  { id: "provocateur", label: "Provocateur" },
];

export default function MarketPage() {
  const router = useRouter();
  const [tab, setTab] = useState<MarketTab>("buy");
  const [view, setView] = useState<ViewMode>("grid");
  const [q, setQ] = useState("");
  const [archFilter, setArchFilter] = useState<Set<FighterArchetype>>(new Set());
  const [eloMin, setEloMin] = useState<string>("");
  const [eloMax, setEloMax] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");

  const { data: all, isLoading } = useFighters({ limit: 128 });

  const list = useMemo(() => {
    const eloMinN = eloMin === "" ? null : Number(eloMin);
    const eloMaxN = eloMax === "" ? null : Number(eloMax);
    const priceMaxN = priceMax === "" ? null : Number(priceMax);
    return all.filter((f) => {
      // Tab filter — buy shows listings for sale, rent shows rental availability.
      // Auction is P2 feature. Strict filter: tabs show only fighters actually
      // in the matching state. Empty state surfaces when nothing qualifies.
      if (tab === "buy" && !f.forSale) return false;
      if (tab === "rent" && !f.forRent) return false;
      if (tab === "auction") return false;
      // Search by name
      if (q && !f.name.toLowerCase().includes(q.toLowerCase())) return false;
      // Archetype checkbox filter (empty set = all allowed)
      if (archFilter.size > 0 && !archFilter.has(f.arch)) return false;
      // ELO range
      if (eloMinN !== null && Number.isFinite(eloMinN) && f.elo < eloMinN) return false;
      if (eloMaxN !== null && Number.isFinite(eloMaxN) && f.elo > eloMaxN) return false;
      // Price max — only applies in buy/rent contexts where a price is known
      if (priceMaxN !== null && Number.isFinite(priceMaxN)) {
        const price = tab === "rent" ? f.rentPrice ?? Infinity : f.price ?? Infinity;
        if (price > priceMaxN) return false;
      }
      return true;
    });
  }, [all, tab, q, archFilter, eloMin, eloMax, priceMax]);

  const counts = {
    buy: all.filter((f) => f.forSale).length,
    rent: all.filter((f) => f.forRent).length,
    auction: 0,
  };

  const toggleArch = (id: FighterArchetype) => {
    setArchFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const anyFilterActive =
    q !== "" ||
    archFilter.size > 0 ||
    eloMin !== "" ||
    eloMax !== "" ||
    priceMax !== "";

  const clearFilters = () => {
    setQ("");
    setArchFilter(new Set());
    setEloMin("");
    setEloMax("");
    setPriceMax("");
  };

  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Marketplace</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 20 }}>
        Buy a fighter outright, hire one for a stretch, or scout the field.
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as MarketTab)}
        tabs={[
          { value: "buy", label: "Buy", count: counts.buy },
          { value: "rent", label: "Rent", count: counts.rent },
          { value: "auction", label: "Auction", count: counts.auction },
        ]}
        style={{ marginBottom: 20 }}
      />

      <div className="al-market-row" style={{ display: "flex", gap: 20 }}>
        <div className="al-market-filter" style={{ width: 220, flexShrink: 0 }}>
          <Card style={{ padding: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div className="label">Archetype</div>
              {anyFilterActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  style={{
                    fontSize: 11,
                    color: "var(--tx-tertiary)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginBottom: 16,
              }}
            >
              {ARCHETYPES.map((a) => (
                <label
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--tx-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={archFilter.has(a.id)}
                    onChange={() => toggleArch(a.id)}
                    style={{ accentColor: "var(--accent)" }}
                  />{" "}
                  {a.label}
                </label>
              ))}
            </div>
            <div className="label" style={{ marginBottom: 10 }}>ELO range</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <Input
                type="number"
                placeholder="Min"
                value={eloMin}
                onChange={(e) => setEloMin(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Max"
                value={eloMax}
                onChange={(e) => setEloMax(e.target.value)}
              />
            </div>
            <div className="label" style={{ marginBottom: 6 }}>
              {tab === "rent" ? "Max rent/day" : "Max price"}
            </div>
            <div style={{ fontSize: 11, color: "var(--tx-tertiary)", marginBottom: 8 }}>
              Hides anything above this 0G ceiling.
            </div>
            <Input
              type="number"
              placeholder="0G"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
            />
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <Input
              leading={<Icon name="search" size={14} />}
              placeholder="Search fighters"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              containerStyle={{ flex: 1 }}
            />
            <div
              style={{
                display: "flex",
                border: "1px solid var(--bd-default)",
                borderRadius: 4,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {(["grid", "list"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  aria-label={v === "grid" ? "Grid view" : "List view"}
                  onClick={() => setView(v)}
                  style={{
                    width: 36,
                    height: 34,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: view === v ? "var(--bg-surface)" : "transparent",
                    color: view === v ? "var(--tx-primary)" : "var(--tx-tertiary)",
                    border: "none",
                    cursor: "pointer",
                    borderRight:
                      v === "grid" ? "1px solid var(--bd-default)" : "none",
                  }}
                >
                  <Icon name={v === "grid" ? "grid" : "list"} size={14} />
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              color: "var(--tx-tertiary)",
              marginBottom: 10,
            }}
          >
            {(() => {
              const n = list.length;
              const total = all.length;
              const label =
                tab === "buy"
                  ? n === 1
                    ? "listing"
                    : "listings"
                  : tab === "rent"
                    ? n === 1
                      ? "rental"
                      : "rentals"
                    : "auctions";
              return (
                <>
                  <span className="num">{n}</span> {label}
                  {total > n && (
                    <>
                      {" · "}
                      <span className="num">{total}</span> fighter
                      {total === 1 ? "" : "s"} total
                    </>
                  )}
                  {anyFilterActive && (
                    <span style={{ marginLeft: 8 }}>· filters active</span>
                  )}
                </>
              );
            })()}
          </div>

          {isLoading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <FighterCardSkel key={i} />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              title={anyFilterActive ? "No matches under those filters" : "Empty market"}
              body={
                anyFilterActive
                  ? "Loosen a filter or wipe them all and try again."
                  : "Nobody's listed yet. Be the first to put one on the block."
              }
              cta={
                anyFilterActive ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{
                      fontSize: 13,
                      padding: "8px 14px",
                      background: "var(--accent-muted)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent-border)",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Clear filters
                  </button>
                ) : null
              }
            />
          ) : view === "grid" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {list.map((f) => (
                <Card
                  key={f.id}
                  interactive
                  onClick={() => router.push(`/fighters/${f.id}`)}
                  style={{ padding: 14 }}
                >
                  <div style={{ display: "flex", justifyContent: "center", padding: 10 }}>
                    <Sigil seed={f.name} size={80} color={f.color} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{f.name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--tx-tertiary)",
                      textTransform: "capitalize",
                    }}
                  >
                    {f.arch} · ELO {f.elo}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px solid var(--bd-subtle)",
                    }}
                  >
                    <span className="label">Owner</span>
                    <Hash value={f.owner} />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-sunken)" }}>
                    {["Fighter", "Archetype", "ELO", "W/L", "Owner"].map((h) => (
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
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => router.push(`/fighters/${f.id}`)}
                      style={{ borderTop: "1px solid var(--bd-subtle)", cursor: "pointer" }}
                    >
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
                      <td style={{ padding: "10px 14px" }} className="num">{f.elo}</td>
                      <td style={{ padding: "10px 14px" }} className="num">
                        {f.w}–{f.l}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <Hash value={f.owner} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
