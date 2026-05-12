"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Sigil } from "@/components/ui/sigil";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { FighterCardSkel, TableSkel } from "@/components/ui/skeleton";
import { Pagination, usePageFromUrl } from "@/components/ui/pagination";
import { PageContainer } from "@/components/shell/page-container";
import { GateScreen } from "@/components/wallet/gate-screen";
import { MomentCard } from "@/components/moment/moment-card";
import { useFighters } from "@/hooks/use-fighters";
import { useMyBets } from "@/hooks/use-my-bets";
import { useMyMoments } from "@/hooks/use-my-moments";
import { useSubnameBatch } from "@/hooks/use-subname";
import { MOMENT_INFT_ADDRESS } from "@/lib/contracts";
import { useDeclineBattle } from "@/hooks/use-accept-battle";
import { usePendingChallenges } from "@/hooks/use-pending-challenges";
import { useToast } from "@/components/ui/toast";
import { Hash } from "@/components/ui/hash";
import { fmtRemaining } from "@/lib/format";
import { useWallet } from "@/hooks/use-wallet";
import {
  CARD_GRID_PAGE_SIZE,
  TABLE_PAGE_SIZE,
  pageToOffset,
} from "@/lib/pagination";

type VaultTab =
  | "owned"
  | "rentedOut"
  | "rentedIn"
  | "challenges"
  | "bets"
  | "history"
  | "moments";

const VALID_TABS: ReadonlySet<VaultTab> = new Set([
  "owned",
  "rentedOut",
  "rentedIn",
  "challenges",
  "bets",
  "history",
  "moments",
]);

export default function VaultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, connected, addr } = useWallet();
  const [tab, setTab] = useState<VaultTab>("owned");

  // Deep-link support: e.g. /vault?tab=challenges from the post-create-
  // battle redirect so challengers land directly on their outgoing list.
  useEffect(() => {
    const q = searchParams.get("tab");
    if (q && VALID_TABS.has(q as VaultTab)) {
      setTab(q as VaultTab);
    }
  }, [searchParams]);

  const { data: mine, isLoading: fightersLoading } = useFighters({
    owner: addr,
  });
  const { data: myBets, isLoading: betsLoading } = useMyBets();
  const {
    incoming: incomingChallenges,
    outgoing: outgoingChallenges,
    isLoading: challengesLoading,
  } = usePendingChallenges(addr);
  const decline = useDeclineBattle();
  const { push } = useToast();

  // CRITICAL: every hook below must run on every render, regardless of
  // connection state. Otherwise React detects a hooks-order change when
  // the wallet flips from disconnected → connected and the early return
  // at the bottom no longer fires. Previously the GateScreen early return
  // sat HERE, hoisting itself above useSubnameBatch + useMyMoments +
  // usePageFromUrl × 2 — those hooks would only run when connected, so
  // hook count flipped and React threw "Rendered more hooks than
  // during the previous render" on first connect. Moved the early return
  // after all hooks (search for "GATE RENDER" below).

  // Batch-resolve subnames for everything in the vault. useSubnameBatch
  // tolerates an empty list via the `enabled` gate on wagmi's
  // useReadContract; safe to call regardless of connection state.
  const allTokenIds = mine.map((f) => f.id);
  const { labels: subnameLabels } = useSubnameBatch(allTokenIds);
  const { data: myMoments, isLoading: momentsLoading } = useMyMoments();

  // Per-tab pagination key. Switching tabs picks up that tab's own
  // page state so jumping back to "owned" after browsing "history"
  // doesn't reset position. Card-tab pages are 24-wide, table-tab
  // pages 50-wide.
  const cardPageKey = `page-${tab}`;
  const cardPage = usePageFromUrl(cardPageKey);
  const cardOffset = pageToOffset(cardPage, CARD_GRID_PAGE_SIZE);
  const tablePageKey = `page-${tab}`;
  const tablePage = usePageFromUrl(tablePageKey);
  const tableOffset = pageToOffset(tablePage, TABLE_PAGE_SIZE);

  // GATE RENDER — all hooks above; gate via JSX branch, not early
  // return. Wallet flips disconnected→connected without changing the
  // hook count.
  if (ready && !connected) {
    return <GateScreen action="the vault" icon="vault" />;
  }

  // mine = everything this wallet owns on-chain AND everything it has in
  // rental escrow (use-fighters overlays the effective owner from the
  // rental listing when a fighter sits in custody) AND every fighter this
  // wallet is currently renting.
  const meLower = addr?.toLowerCase();
  const rentedIn = mine.filter(
    (f) => f.rentedBy && meLower && f.rentedBy.toLowerCase() === meLower,
  );
  const rentedOut = mine.filter(
    (f) => f.forRent && (!f.rentedBy || f.rentedBy.toLowerCase() !== meLower),
  );
  const owned = mine.filter(
    (f) =>
      !f.forRent &&
      !(f.rentedBy && meLower && f.rentedBy.toLowerCase() === meLower),
  );
  const activeBets = myBets.filter((b) => b.status === "active");
  const settledBets = myBets.filter((b) => b.status !== "active");
  const pnl = settledBets.reduce((s, b) => s + (b.pnl ?? 0), 0);

  const ownedPage = owned.slice(cardOffset, cardOffset + CARD_GRID_PAGE_SIZE);
  const rentedOutPage = rentedOut.slice(
    cardOffset,
    cardOffset + CARD_GRID_PAGE_SIZE,
  );
  const rentedInPage = rentedIn.slice(
    cardOffset,
    cardOffset + CARD_GRID_PAGE_SIZE,
  );
  const momentsPage = myMoments.slice(
    cardOffset,
    cardOffset + CARD_GRID_PAGE_SIZE,
  );
  const activeBetsPage = activeBets.slice(
    tableOffset,
    tableOffset + TABLE_PAGE_SIZE,
  );
  const settledBetsPage = settledBets.slice(
    tableOffset,
    tableOffset + TABLE_PAGE_SIZE,
  );

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
        Vault
      </h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 20 }}>
        Your roster, your rentals, your stakes, your receipts.
      </div>

      <div
        className="al-stats-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard label="Owned fighters" value={owned.length} mono={false} />
        <StatCard
          label="Active bets"
          value={activeBets.length}
          sub={`${activeBets.reduce((s, b) => s + b.amount, 0).toFixed(2)} 0G locked`}
          mono={false}
        />
        <StatCard
          label="Lifetime P/L"
          value={`${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
          sub="0G"
          mono={false}
        />
        <StatCard label="Active rentals in" value={rentedIn.length} mono={false} />
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as VaultTab)}
        tabs={[
          { value: "owned", label: "Owned", count: owned.length },
          { value: "rentedOut", label: "Rented out", count: rentedOut.length },
          { value: "rentedIn", label: "Rented in", count: rentedIn.length },
          {
            value: "challenges",
            label: "Challenges",
            count: incomingChallenges.length + outgoingChallenges.length,
          },
          { value: "bets", label: "Bets", count: activeBets.length },
          { value: "history", label: "History", count: settledBets.length },
          ...(MOMENT_INFT_ADDRESS !== ""
            ? [{ value: "moments", label: "Moments", count: myMoments.length }]
            : []),
        ]}
        style={{ marginBottom: 20 }}
      />

      {tab === "owned" &&
        (fightersLoading ? (
          <CardGridSkel count={6} />
        ) : owned.length === 0 ? (
          <EmptyState
            title="Empty corner"
            body="Mint a fighter and find out who you are in the ring."
            cta={
              <Button variant="primary" onClick={() => router.push("/mint")}>
                Mint fighter
              </Button>
            }
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {ownedPage.map((f) => (
              <Card key={f.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Sigil seed={f.name} size={56} color={f.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{f.name}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--tx-tertiary)",
                        textTransform: "capitalize",
                      }}
                    >
                      {f.arch}
                    </div>
                    {subnameLabels[f.id] && (
                      <div
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: "var(--accent)",
                          marginTop: 2,
                          letterSpacing: 0.04,
                        }}
                      >
                        {subnameLabels[f.id]}.yap.0g
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        marginTop: 8,
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--tx-secondary)",
                      }}
                    >
                      <span>ELO {f.elo}</span>
                      <span>
                        {f.w}–{f.l}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/battle/new?fighter=${f.id}`)}
                    style={{ flex: 1 }}
                  >
                    Battle
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/fighters/${f.id}`)}
                    style={{ flex: 1 }}
                  >
                    View
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ))}
      {tab === "owned" && (
        <Pagination
          total={owned.length}
          limit={CARD_GRID_PAGE_SIZE}
          paramKey={cardPageKey}
          noun="fighters"
        />
      )}

      {tab === "rentedOut" &&
        (fightersLoading ? (
          <CardGridSkel count={6} />
        ) : rentedOut.length === 0 ? (
          <EmptyState
            title="No fighters out for hire"
            body="List a fighter for rent. Earn 0G while it works for someone else."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {rentedOutPage.map((f) => (
              <Card key={f.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Sigil seed={f.name} size={56} color={f.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{f.name}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--tx-tertiary)",
                        textTransform: "capitalize",
                      }}
                    >
                      {f.arch}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "var(--accent)",
                      }}
                    >
                      {(f.rentPrice ?? 0).toFixed(3)} 0G/day
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/fighters/${f.id}`)}
                    style={{ flex: 1 }}
                  >
                    Manage
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ))}
      {tab === "rentedOut" && (
        <Pagination
          total={rentedOut.length}
          limit={CARD_GRID_PAGE_SIZE}
          paramKey={cardPageKey}
          noun="rentals"
        />
      )}

      {tab === "rentedIn" &&
        (fightersLoading ? (
          <CardGridSkel count={6} />
        ) : rentedIn.length === 0 ? (
          <EmptyState
            title="No borrowed fighters"
            body="Rent one from the marketplace and battle without committing to a mint. Your wallet keeps every win."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {rentedInPage.map((f) => {
              const expiresIn = f.rentExpiresAt
                ? Math.max(0, f.rentExpiresAt - Date.now())
                : 0;
              const days = Math.floor(expiresIn / (24 * 3600 * 1000));
              const hours = Math.floor(
                (expiresIn % (24 * 3600 * 1000)) / (3600 * 1000),
              );
              return (
                <Card key={f.id} style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <Sigil seed={f.name} size={56} color={f.color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{f.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--tx-tertiary)",
                          textTransform: "capitalize",
                        }}
                      >
                        {f.arch}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          color: "var(--accent)",
                        }}
                      >
                        Expires in {days}d {hours}h
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => router.push(`/battle/new?fighter=${f.id}`)}
                      style={{ flex: 1 }}
                    >
                      Battle
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/fighters/${f.id}`)}
                      style={{ flex: 1 }}
                    >
                      View
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
      {tab === "rentedIn" && (
        <Pagination
          total={rentedIn.length}
          limit={CARD_GRID_PAGE_SIZE}
          paramKey={cardPageKey}
          noun="rentals"
        />
      )}

      {tab === "challenges" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div className="label" style={{ marginBottom: 10 }}>
              Incoming challenges — {incomingChallenges.length}
            </div>
            {challengesLoading ? (
              <ChallengesListSkel />
            ) : incomingChallenges.length === 0 ? (
              <EmptyState
                title="Nobody's calling you out. Yet."
                body="Challenges to your fighters land here for accept or decline."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {incomingChallenges.map((c) => (
                  <Card key={c.battleId} style={{ padding: 14 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            marginBottom: 4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <strong>Fighter #{c.fighterA}</strong> vs{" "}
                          <strong>#{c.fighterB}</strong> · {c.topic}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--tx-tertiary)",
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span>
                            from <Hash value={c.challenger} />
                          </span>
                          <span>·</span>
                          <span>expires {fmtRemaining(c.expiresAt)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              const tx = await decline.write(c.battleId);
                              push({
                                kind: "default",
                                text: `Declined · tx ${tx.slice(0, 10)}…`,
                              });
                            } catch (e) {
                              push({
                                kind: "error",
                                text:
                                  e instanceof Error ? e.message : "Decline failed",
                              });
                            }
                          }}
                          disabled={decline.isPending || decline.isConfirming}
                        >
                          Decline
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/arenas/b-${c.battleId
                                .toString(16)
                                .padStart(4, "0")}`,
                            )
                          }
                        >
                          Review &amp; accept
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 10 }}>
              Outgoing challenges — {outgoingChallenges.length}
            </div>
            {challengesLoading ? (
              <ChallengesListSkel />
            ) : outgoingChallenges.length === 0 ? (
              <EmptyState
                title="You haven't picked a fight. Yet."
                body="Open challenges sit here until the defender accepts or the clock runs out."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {outgoingChallenges.map((c) => (
                  <Card key={c.battleId} style={{ padding: 14 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, marginBottom: 4 }}>
                          <strong>#{c.fighterA}</strong> vs{" "}
                          <strong>#{c.fighterB}</strong> · {c.topic}
                        </div>
                        <div
                          style={{ fontSize: 11, color: "var(--tx-tertiary)" }}
                        >
                          <Badge tone="warning">Waiting</Badge> · expires{" "}
                          {fmtRemaining(c.expiresAt)}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "bets" &&
        (betsLoading ? (
          <TableSkel rows={6} cols={6} />
        ) : activeBets.length === 0 ? (
          <EmptyState
            title="Nothing on the table"
            body="Pick a battle, place a stake. Live bets show up here."
          />
        ) : (
          <Card>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-sunken)" }}>
                  {["Battle", "Side", "Amount", "Odds", "Status", "Potential"].map((h) => (
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
                {activeBetsPage.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/arenas/${b.battleId}`)}
                    style={{
                      borderTop: "1px solid var(--bd-subtle)",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "10px 14px" }}>
                      <div className="mono" style={{ fontSize: 12 }}>
                        {b.battleId}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge tone={b.side}>{b.side === "a" ? "Corner A" : "Corner B"}</Badge>
                    </td>
                    <td style={{ padding: "10px 14px" }} className="num">
                      {b.amount.toFixed(2)} 0G
                    </td>
                    <td style={{ padding: "10px 14px" }} className="num">
                      {b.odds}x
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge tone="warning">Active</Badge>
                    </td>
                    <td
                      style={{ padding: "10px 14px", color: "var(--accent)" }}
                      className="num"
                    >
                      {b.potential?.toFixed(2)} 0G
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      {tab === "bets" && (
        <Pagination
          total={activeBets.length}
          limit={TABLE_PAGE_SIZE}
          paramKey={tablePageKey}
          noun="bets"
        />
      )}

      {tab === "history" &&
        (betsLoading ? (
          <TableSkel rows={6} cols={5} />
        ) : settledBets.length === 0 ? (
          <EmptyState
            title="Receipts pending"
            body="Settled battles land here. Win or lose, every call is on-chain."
          />
        ) : (
          <Card>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-sunken)" }}>
                  {["Battle", "Side", "Amount", "Result", "P/L"].map((h) => (
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
                {settledBetsPage.map((b) => (
                  <tr key={b.id} style={{ borderTop: "1px solid var(--bd-subtle)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div className="mono" style={{ fontSize: 12 }}>
                        {b.battleId}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge tone={b.side}>{b.side === "a" ? "Corner A" : "Corner B"}</Badge>
                    </td>
                    <td style={{ padding: "10px 14px" }} className="num">
                      {b.amount.toFixed(2)} 0G
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge tone={b.status === "won" ? "success" : "danger"}>
                        {b.status === "won" ? "Won" : "Lost"}
                      </Badge>
                    </td>
                    <td
                      className="num"
                      style={{
                        padding: "10px 14px",
                        color: (b.pnl ?? 0) >= 0 ? "var(--success)" : "var(--danger)",
                      }}
                    >
                      {(b.pnl ?? 0) >= 0 ? "+" : ""}
                      {(b.pnl ?? 0).toFixed(2)} 0G
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      {tab === "history" && (
        <Pagination
          total={settledBets.length}
          limit={TABLE_PAGE_SIZE}
          paramKey={tablePageKey}
          noun="receipts"
        />
      )}

      {tab === "moments" &&
        (momentsLoading && myMoments.length === 0 ? (
          <CardGridSkel count={6} />
        ) : myMoments.length === 0 ? (
          <EmptyState
            title="No moments minted"
            body="Settle a battle, mint the round you'll want to remember. Each Moment is an ERC-7857 INFT bound to a specific (battle, round, side)."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {momentsPage.map((m) => (
              <MomentCard
                key={m.tokenId}
                moment={m}
                viewerAddr={(addr as `0x${string}` | undefined) ?? null}
              />
            ))}
          </div>
        ))}
      {tab === "moments" && (
        <Pagination
          total={myMoments.length}
          limit={CARD_GRID_PAGE_SIZE}
          paramKey={cardPageKey}
          noun="moments"
        />
      )}
    </PageContainer>
  );
}

// Card-grid placeholder used while owned/rented/moments are still loading
// from chain. Six tiles by default — matches the typical above-fold count
// without overpromising data that isn't there yet.
function CardGridSkel({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <FighterCardSkel key={i} />
      ))}
    </div>
  );
}

// Stacked-row placeholder mirroring the incoming/outgoing challenge cards
// above: padding 14, flex row with a title + meta-line text column on the
// left and a two-button action cluster on the right. Matches the loaded
// vertical rhythm so accept/decline buttons don't jump in on swap.
function ChallengesListSkel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: 14,
            background: "var(--yap-ink-800)",
            border: "1px solid var(--yap-ink-600)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="al-skel"
              style={{ height: 13, width: "65%", marginBottom: 6, borderRadius: 3 }}
            />
            <div
              className="al-skel"
              style={{ height: 11, width: "40%", borderRadius: 3 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <div
              className="al-skel"
              style={{ height: 28, width: 68, borderRadius: 3 }}
            />
            <div
              className="al-skel"
              style={{ height: 28, width: 130, borderRadius: 3 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
