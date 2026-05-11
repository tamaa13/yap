"use client";

// Full Moment marketplace surface — secondary market for ERC-7857
// Battle Moments. Distinct from the fighter marketplace because the
// filter/sort axes don't overlap (battles, sides, fighters, price)
// and the buy flow has its own royalty + fee breakdown.
//
// Wired to:
//   - useMomentListings: discovers active listings via event scan +
//     getListing read.
//   - useBuyMoment: dispatches the buy tx.
//   - RoyaltyPaid event watcher: surfaces a toast whenever a royalty
//     payout lands while the user is on this tab (live audit
//     storytelling for the demo).

import { useMemo, useState } from "react";
import { parseAbiItem, formatEther } from "viem";
import { useWatchContractEvent } from "wagmi";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FighterCardSkel } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import {
  Pagination,
  PaginatedRows,
  usePageFromUrl,
} from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useMomentListings } from "@/hooks/use-moment-listings";
import { useBuyMoment } from "@/hooks/use-buy-moment";
import { useWallet, useWalletGate } from "@/hooks/use-wallet";
import { MARKETPLACE_ABI, MOMENT_MARKET_ADDRESS } from "@/lib/contracts";
import { CARD_GRID_PAGE_SIZE, pageToOffset } from "@/lib/pagination";
import type { MomentListing } from "@/hooks/use-moment-listings";
import { MomentListingCard } from "./moment-listing-card";
import { MomentBuyModal } from "./moment-buy-modal";
import { fmtNum } from "@/lib/format";

type SortKey = "newest" | "priceAsc" | "priceDesc";
type SideFilter = "all" | "a" | "b";

const ROYALTY_PAID_EVENT = parseAbiItem(
  "event RoyaltyPaid(uint256 indexed tokenId, address indexed receiver, uint256 amount)",
);

export function MomentsMarket() {
  const { data: listings, isLoading } = useMomentListings();
  const { addr: viewerAddr } = useWallet();
  const gate = useWalletGate();
  const buy = useBuyMoment();
  const { push } = useToast();

  const [q, setQ] = useState("");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [battleFilter, setBattleFilter] = useState<string>("all");
  const [fighterFilter, setFighterFilter] = useState<string>("all");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [buyTarget, setBuyTarget] = useState<MomentListing | null>(null);

  // Derive battle + fighter dropdown options from current listings so
  // filters stay coherent with what's actually for sale.
  const battleOptions = useMemo(() => {
    const ids = Array.from(new Set(listings.map((l) => l.battleId))).sort(
      (a, b) => b - a,
    );
    return ids;
  }, [listings]);
  const fighterOptions = useMemo(() => {
    const ids = Array.from(
      new Set(listings.map((l) => l.fighterTokenId)),
    ).sort((a, b) => a - b);
    return ids;
  }, [listings]);

  // Live royalty audit toast — only fires while user is on this tab,
  // so the demo recording can show the durable royalty flow as it
  // happens. Quiet on tabs the user isn't watching (component
  // unmounts → wagmi tears down the subscription).
  useWatchContractEvent({
    address:
      MOMENT_MARKET_ADDRESS !== ""
        ? (MOMENT_MARKET_ADDRESS as `0x${string}`)
        : undefined,
    abi: MARKETPLACE_ABI,
    eventName: "RoyaltyPaid",
    enabled: MOMENT_MARKET_ADDRESS !== "",
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as unknown as {
          args?: { tokenId?: bigint; receiver?: `0x${string}`; amount?: bigint };
        }).args;
        if (!args?.amount) continue;
        const amt = Number(formatEther(args.amount));
        push({
          kind: "default",
          text: `Royalty paid · ${fmtNum(amt, 4)} 0G to creator`,
        });
      }
    },
  });

  const list = useMemo(() => {
    const priceMinN = priceMin === "" ? null : Number(priceMin);
    const priceMaxN = priceMax === "" ? null : Number(priceMax);
    let filtered = listings.filter((l) => {
      if (sideFilter === "a" && l.side !== 0) return false;
      if (sideFilter === "b" && l.side !== 1) return false;
      if (battleFilter !== "all" && String(l.battleId) !== battleFilter)
        return false;
      if (fighterFilter !== "all" && String(l.fighterTokenId) !== fighterFilter)
        return false;
      if (priceMinN !== null && Number.isFinite(priceMinN) && l.price < priceMinN)
        return false;
      if (priceMaxN !== null && Number.isFinite(priceMaxN) && l.price > priceMaxN)
        return false;
      if (q) {
        const needle = q.toLowerCase();
        if (
          !String(l.tokenId).includes(needle) &&
          !String(l.battleId).includes(needle) &&
          !String(l.fighterTokenId).includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
    if (sort === "priceAsc") {
      filtered = [...filtered].sort((a, b) => a.price - b.price);
    } else if (sort === "priceDesc") {
      filtered = [...filtered].sort((a, b) => b.price - a.price);
    } else {
      // newest: listedAt desc
      filtered = [...filtered].sort((a, b) => b.listedAt - a.listedAt);
    }
    return filtered;
  }, [
    listings,
    q,
    sideFilter,
    battleFilter,
    fighterFilter,
    priceMin,
    priceMax,
    sort,
  ]);

  const page = usePageFromUrl("page-moments");
  const offset = pageToOffset(page, CARD_GRID_PAGE_SIZE);
  const visible = list.slice(offset, offset + CARD_GRID_PAGE_SIZE);

  const anyFilterActive =
    q !== "" ||
    sideFilter !== "all" ||
    battleFilter !== "all" ||
    fighterFilter !== "all" ||
    priceMin !== "" ||
    priceMax !== "";

  const clearFilters = () => {
    setQ("");
    setSideFilter("all");
    setBattleFilter("all");
    setFighterFilter("all");
    setPriceMin("");
    setPriceMax("");
  };

  const startBuy = (listing: MomentListing) => {
    gate(`Hire moment #${listing.tokenId}`, () => setBuyTarget(listing));
  };

  const confirmBuy = async () => {
    if (!buyTarget) return;
    try {
      const tx = await buy.write({
        tokenId: buyTarget.tokenId,
        priceWei: buyTarget.priceWei,
      });
      push({
        kind: "success",
        text: `Moment #${buyTarget.tokenId} on its way · tx ${tx.slice(0, 10)}…`,
      });
      setBuyTarget(null);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Buy failed",
      });
    }
  };

  return (
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
            <div className="label">Side</div>
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
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {(["all", "a", "b"] as SideFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setSideFilter(s)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  background:
                    sideFilter === s
                      ? "var(--bg-surface)"
                      : "var(--bg-sunken)",
                  color:
                    sideFilter === s
                      ? "var(--tx-primary)"
                      : "var(--tx-tertiary)",
                  border: "1px solid var(--bd-default)",
                  cursor: "pointer",
                }}
              >
                {s === "all" ? "Both" : s === "a" ? "PRO/A" : "CON/B"}
              </button>
            ))}
          </div>

          <div className="label" style={{ marginBottom: 6 }}>
            Battle
          </div>
          <select
            value={battleFilter}
            onChange={(e) => setBattleFilter(e.target.value)}
            style={{
              width: "100%",
              height: 32,
              padding: "0 8px",
              background: "var(--bg-sunken)",
              border: "1px solid var(--bd-default)",
              color: "var(--tx-primary)",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            <option value="all">All battles</option>
            {battleOptions.map((id) => (
              <option key={id} value={String(id)}>
                Battle #{id}
              </option>
            ))}
          </select>

          <div className="label" style={{ marginBottom: 6 }}>
            Fighter
          </div>
          <select
            value={fighterFilter}
            onChange={(e) => setFighterFilter(e.target.value)}
            style={{
              width: "100%",
              height: 32,
              padding: "0 8px",
              background: "var(--bg-sunken)",
              border: "1px solid var(--bd-default)",
              color: "var(--tx-primary)",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            <option value="all">All fighters</option>
            {fighterOptions.map((id) => (
              <option key={id} value={String(id)}>
                Fighter #{id}
              </option>
            ))}
          </select>

          <div className="label" style={{ marginBottom: 6 }}>
            Price range (0G)
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Input
              type="number"
              placeholder="Min"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Max"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
            />
          </div>
        </Card>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <Input
            leading={<Icon name="search" size={14} />}
            placeholder="Search token / battle / fighter"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            containerStyle={{ flex: 1 }}
          />
          <div
            style={{
              display: "flex",
              border: "1px solid var(--bd-default)",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {(
              [
                { id: "newest", label: "Newest" },
                { id: "priceAsc", label: "Price ↑" },
                { id: "priceDesc", label: "Price ↓" },
              ] as Array<{ id: SortKey; label: string }>
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                style={{
                  padding: "0 14px",
                  height: 34,
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  letterSpacing: 0.5,
                  background:
                    sort === s.id
                      ? "var(--bg-surface)"
                      : "transparent",
                  color:
                    sort === s.id ? "var(--tx-primary)" : "var(--tx-tertiary)",
                  borderRight:
                    s.id !== "priceDesc" ? "1px solid var(--bd-subtle)" : "none",
                  cursor: "pointer",
                }}
              >
                {s.label}
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
          <span className="num">{list.length}</span>{" "}
          {list.length === 1 ? "listing" : "listings"}
          {listings.length > list.length && (
            <>
              {" · "}
              <span className="num">{listings.length}</span> total
            </>
          )}
          {anyFilterActive && (
            <span style={{ marginLeft: 8 }}>· filters active</span>
          )}
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
            title={
              anyFilterActive
                ? "No moments match these filters"
                : "No moments listed yet"
            }
            body={
              anyFilterActive
                ? "Loosen a filter or wipe them all and look again."
                : "Be the first to immortalize a round. Mint a Moment from a settled battle and list it here."
            }
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <PaginatedRows pageKey={page}>
              {visible.map((l) => (
                <MomentListingCard
                  key={l.tokenId}
                  listing={l}
                  onBuy={startBuy}
                  viewerAddr={(viewerAddr as `0x${string}` | undefined) ?? null}
                />
              ))}
            </PaginatedRows>
          </div>
        )}

        <Pagination
          total={list.length}
          limit={CARD_GRID_PAGE_SIZE}
          paramKey="page-moments"
          noun="moments"
        />
      </div>

      <MomentBuyModal
        open={!!buyTarget}
        onClose={() => setBuyTarget(null)}
        listing={buyTarget}
        submitting={buy.isPending || buy.isConfirming}
        onConfirm={confirmBuy}
      />
    </div>
  );
}
