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
import { Pagination, usePageFromUrl } from "@/components/ui/pagination";
import { RecordBadge, Split, TokenTag } from "@/components/ui/badge";
import { useFighters } from "@/hooks/use-fighters";
import { useMomentListings } from "@/hooks/use-moment-listings";
import { CARD_GRID_PAGE_SIZE, pageToOffset } from "@/lib/pagination";
import { MOMENT_MARKET_ADDRESS } from "@/lib/contracts";
import type { FighterArchetype } from "@/lib/types";
import { MomentsMarket } from "./moments-market";

type MarketTab = "buy" | "rent" | "auction" | "moments";
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

  // Pull full catalog so we filter+paginate post-fetch (testnet scale).
  // See lib/pagination.ts header for mainnet migration path.
  const { data: all, isLoading } = useFighters({ limit: 9999 });
  // Lightweight count for the moments tab badge — only the length;
  // MomentsMarket handles its own deep query when activated.
  const { data: momentListings } = useMomentListings();

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

  // Page slicing — list is the post-filter set; pagination consumes
  // its length so the count line tells the truth even when filters
  // are active.
  const page = usePageFromUrl();
  const offset = pageToOffset(page, CARD_GRID_PAGE_SIZE);
  const visible = list.slice(offset, offset + CARD_GRID_PAGE_SIZE);

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
      <h1
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 400,
          fontSize: 56,
          lineHeight: 0.9,
          letterSpacing: "-0.5px",
          textTransform: "uppercase",
          marginBottom: 8,
          color: "var(--yap-ink-50)",
        }}
      >
        Marketplace
      </h1>
      <div
        style={{
          fontSize: 14,
          color: "var(--yap-ink-200)",
          marginBottom: 24,
          maxWidth: "60ch",
        }}
      >
        Buy a fighter outright, hire one for a stretch, or scout the field.
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as MarketTab)}
        tabs={[
          { value: "buy", label: "Buy", count: counts.buy },
          { value: "rent", label: "Rent", count: counts.rent },
          { value: "auction", label: "Auction", count: counts.auction },
          ...(MOMENT_MARKET_ADDRESS !== ""
            ? [
                {
                  value: "moments",
                  label: "Moments",
                  count: momentListings.length,
                },
              ]
            : []),
        ]}
        style={{ marginBottom: 20 }}
      />

      {tab === "moments" ? (
        <MomentsMarket />
      ) : (
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
              {visible.map((f, i) => (
                <Card
                  key={f.id}
                  interactive
                  onClick={() => router.push(`/fighters/${f.id}`)}
                  style={{ padding: 16 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 14,
                    }}
                  >
                    <Sigil
                      seed={f.name}
                      size={72}
                      color={i % 2 === 0 ? "var(--yap-crimson)" : "var(--yap-gold)"}
                    />
                    <TokenTag>#{f.id}</TokenTag>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--yap-font-display-2)",
                      fontWeight: 400,
                      fontSize: 26,
                      lineHeight: 0.95,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                      color: "var(--yap-ink-50)",
                    }}
                  >
                    {f.name}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--yap-ink-300)",
                      letterSpacing: 1.5,
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
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <RecordBadge w={f.w} l={f.l} size="sm" />
                    {f.forSale && f.price ? (
                      <Split
                        k="Buy"
                        v={`${f.price.toFixed(2)} 0G`}
                        size="sm"
                        tone="gold"
                      />
                    ) : f.forRent && f.rentPrice ? (
                      <Split
                        k="Hire"
                        v={`${f.rentPrice.toFixed(3)} 0G/d`}
                        size="sm"
                      />
                    ) : (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: "var(--yap-ink-400)",
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                        }}
                      >
                        ELO {f.elo}
                      </span>
                    )}
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
                  {visible.map((f) => (
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
          <Pagination
            total={list.length}
            limit={CARD_GRID_PAGE_SIZE}
            noun={
              tab === "buy"
                ? "listings"
                : tab === "rent"
                  ? "rentals"
                  : "auctions"
            }
          />
        </div>
      </div>
      )}
    </PageContainer>
  );
}
