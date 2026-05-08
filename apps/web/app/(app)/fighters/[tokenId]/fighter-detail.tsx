"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Hash } from "@/components/ui/hash";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Sigil } from "@/components/ui/sigil";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageContainer } from "@/components/shell/page-container";
import { useBuyFighter } from "@/hooks/use-buy-fighter";
import { useCancelListing } from "@/hooks/use-cancel-listing";
import { useListFighter } from "@/hooks/use-list-fighter";
import { useListForRent } from "@/hooks/use-list-for-rent";
import { useListing } from "@/hooks/use-listing";
import { useRentalListing } from "@/hooks/use-rental-listing";
import { useCancelRentListing, useRentFighter } from "@/hooks/use-rent-fighter";
import { useWalletGate, useWallet } from "@/hooks/use-wallet";
import { parseEther } from "viem";
import { activeChain } from "@/lib/chains";
import { FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import { DisputePanel } from "./dispute-panel";
import { TrainModal } from "./train-modal";
import { TrainingHistory } from "./training-history";
import { fmtNum, fmtRemaining, fmtTime } from "@/lib/format";
import type { Address } from "viem";
import type { Battle, Fighter, FighterArchetype } from "@/lib/types";

type DetailTab = "overview" | "history" | "earnings";

// Map a 0-100 trait value to one of the app's semantic colors. Low = danger,
// mid = warning, upper-mid = accent (amber), high = success.
function traitColor(value: number): string {
  if (value < 40) return "var(--danger)";
  if (value < 60) return "var(--warning)";
  if (value < 80) return "var(--accent)";
  return "var(--success)";
}

const ARCH_BLURBS: Record<FighterArchetype, string> = {
  roaster:
    "Short-form combat specialist. Wins on punchlines, loses if the opponent reaches second-order reasoning. Thrives under time pressure and hostile crowds.",
  debater:
    "Structured arguments, surgical rebuttals. Builds logical chains opponents have to unravel before they can counter. Vulnerable to chaotic opponents.",
  philosopher:
    "First-principles reasoning on long horizons. Reframes the debate so the opponent's ground shifts under them. Slow to start, devastating in final rounds.",
  troll:
    "Unpredictable and derailing. Doesn't play the topic — plays the opponent. Thrives when the judge values surprise and rewards refusing the premise.",
  scholar:
    "Citation-heavy, precedent-driven. Weaponizes prior work and forces opponents to fight the corpus, not just the scholar. Shines in factual topics.",
  provocateur:
    "Goads with calculated edges. Baits the opponent into emotional responses, then turns their overreach against them. Moral composure is their range.",
};

export function FighterDetail({
  fighter,
  isMine,
  recentBattles,
}: {
  fighter: Fighter;
  isMine: boolean;
  recentBattles: Battle[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const gate = useWalletGate();

  const [tab, setTab] = useState<DetailTab>("overview");
  const [listOpen, setListOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false); // owner: list for rent
  const [trainOpen, setTrainOpen] = useState(false); // owner: continuous-learning re-seal session
  const [rentNowOpen, setRentNowOpen] = useState(false); // non-owner: rent duration
  const [rentDurationInput, setRentDurationInput] = useState(3); // for renter
  const [listPrice, setListPrice] = useState<string>("0.1");
  const [rentPricePerDay, setRentPricePerDay] = useState<string>("0.01");
  const [rentMaxDays, setRentMaxDays] = useState<number>(7);
  const [rentDisputable, setRentDisputable] = useState<boolean>(false);
  const listFighter = useListFighter();
  const cancelListing = useCancelListing();
  const buyFighter = useBuyFighter();
  const listForRent = useListForRent();
  const cancelRentListing = useCancelRentListing();
  const rentFighter = useRentFighter();
  const { addr: viewerAddr } = useWallet();

  // Live on-chain listing state from the Marketplace contract.
  const { data: chainListing, refetch: refetchListing } = useListing(fighter.id);
  const isListedOnChain = chainListing?.active ?? false;
  const chainPrice = chainListing?.price ?? 0;
  const chainPriceWei = chainListing?.priceWei ?? 0n;

  // Live rental state from the RentalEscrow contract.
  const { data: rentalState, refetch: refetchRental } = useRentalListing(fighter.id);
  const isListedForRent = !!rentalState?.listing?.active;
  const rentPriceDisplay = rentalState?.listing?.pricePerDay ?? 0;
  const rentPricePerDayWei = rentalState?.listing?.pricePerDayWei ?? 0n;
  const rentMaxDuration = rentalState?.listing?.maxDurationDays ?? 0;
  const activeRenter = rentalState?.active?.renter ?? null;
  const rentalExpiresAt = rentalState?.active?.expiresAt ?? 0;

  const listingBusy =
    listFighter.isPending ||
    listFighter.isConfirming ||
    cancelListing.isPending ||
    cancelListing.isConfirming ||
    listForRent.isPending ||
    listForRent.isConfirming ||
    cancelRentListing.isPending ||
    cancelRentListing.isConfirming;

  const submitListing = async () => {
    const price = listPrice.trim();
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      push({ kind: "error", text: "Enter a valid price in 0G." });
      return;
    }
    try {
      const txHash = await listFighter.write({
        tokenId: fighter.id,
        priceEth: price,
      });
      push({ kind: "success", text: `Listed for ${price} 0G · tx ${txHash.slice(0, 10)}…` });
      setListOpen(false);
      setTimeout(() => refetchListing(), 2000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Listing failed",
      });
    }
  };

  const submitUnlist = async () => {
    try {
      const txHash = await cancelListing.write(fighter.id);
      push({ kind: "success", text: `Listing cancelled · tx ${txHash.slice(0, 10)}…` });
      setTimeout(() => refetchListing(), 2000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Unlist failed",
      });
    }
  };

  const submitBuy = async () => {
    if (!isListedOnChain) {
      push({ kind: "error", text: "Fighter not listed." });
      return;
    }
    try {
      const txHash = await buyFighter.write({
        tokenId: fighter.id,
        priceWei: chainPriceWei,
      });
      push({
        kind: "success",
        text: `Purchase confirmed · tx ${txHash.slice(0, 10)}…`,
      });
      setTimeout(() => refetchListing(), 2000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Purchase failed",
      });
    }
  };

  const submitListForRent = async () => {
    const ppd = rentPricePerDay.trim();
    const ppdNum = Number(ppd);
    if (!Number.isFinite(ppdNum) || ppdNum <= 0) {
      push({ kind: "error", text: "Enter a valid price per day." });
      return;
    }
    if (!Number.isFinite(rentMaxDays) || rentMaxDays <= 0 || rentMaxDays > 365) {
      push({ kind: "error", text: "Max duration must be 1–365 days." });
      return;
    }
    try {
      const tx = await listForRent.write({
        tokenId: fighter.id,
        pricePerDayEth: ppd,
        maxDurationDays: rentMaxDays,
        disputable: rentDisputable,
      });
      push({
        kind: "success",
        text: `Listed for rent · ${ppd} 0G/day · tx ${tx.slice(0, 10)}…`,
      });
      setRentOpen(false);
      setTimeout(() => refetchRental(), 2000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "List for rent failed",
      });
    }
  };

  const submitCancelRent = async () => {
    try {
      const tx = await cancelRentListing.write(fighter.id);
      push({
        kind: "success",
        text: `Rent listing cancelled · tx ${tx.slice(0, 10)}…`,
      });
      setTimeout(() => refetchRental(), 2000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Cancel failed",
      });
    }
  };

  const submitRent = async () => {
    if (!isListedForRent) {
      push({ kind: "error", text: "Fighter not listed for rent." });
      return;
    }
    if (
      !Number.isFinite(rentDurationInput) ||
      rentDurationInput <= 0 ||
      rentDurationInput > rentMaxDuration
    ) {
      push({
        kind: "error",
        text: `Duration must be 1–${rentMaxDuration} days.`,
      });
      return;
    }
    try {
      const total = rentPricePerDayWei * BigInt(rentDurationInput);
      const tx = await rentFighter.write({
        tokenId: fighter.id,
        durationDays: rentDurationInput,
        totalWei: total,
      });
      push({
        kind: "success",
        text: `Rented ${rentDurationInput} day(s) · tx ${tx.slice(0, 10)}…`,
      });
      setTimeout(() => refetchRental(), 2000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Rent failed",
      });
    }
  };

  // Mutually-exclusive guards: a token cannot sit in both escrows simultaneously.
  // When already listed for sale, hide the rent-out CTA (and vice versa).
  const canListForSale = !isListedForRent && !activeRenter;
  const canListForRent = !isListedOnChain && !activeRenter;
  const isViewerActiveRenter =
    !!viewerAddr &&
    !!activeRenter &&
    viewerAddr.toLowerCase() === activeRenter.toLowerCase();

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: "Marketplace", to: "/market" },
          { label: `Fighter #${fighter.id}` },
        ]}
      />

      <div
        className="al-detail-2col"
        style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}
      >
        <div>
          <Card style={{ padding: 24, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
              <Sigil seed={fighter.name} size={120} color={fighter.color} radius={6} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <h1 style={{ fontSize: 28, letterSpacing: "-0.01em" }}>{fighter.name}</h1>
                  <Badge mono tone="success">
                    <Icon name="shield" size={10} />
                    &nbsp;TEE
                  </Badge>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--tx-secondary)",
                    marginBottom: 12,
                    textTransform: "capitalize",
                  }}
                >
                  {fighter.arch}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 14,
                  }}
                >
                  <div>
                    <div className="label">ELO</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                      {fighter.elo}
                    </div>
                  </div>
                  <div>
                    <div className="label">Record</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                      {fighter.w}–{fighter.l}
                    </div>
                  </div>
                  <div>
                    <div className="label">Battles</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                      {fighter.battles}
                    </div>
                  </div>
                  <div>
                    <div className="label">Earnings</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                      {fmtNum(fighter.earnings)} 0G
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isMine ? (
                <>
                  <Button
                    variant="primary"
                    leading={<Icon name="sword" size={14} />}
                    onClick={() => router.push(`/battle/new?fighter=${fighter.id}`)}
                  >
                    Send to battle
                  </Button>
                  {isListedOnChain ? (
                    <Button
                      leading={<Icon name="tag" size={14} />}
                      onClick={submitUnlist}
                      disabled={listingBusy}
                    >
                      {cancelListing.isPending
                        ? "Cancel in wallet…"
                        : cancelListing.isConfirming
                          ? "Cancelling…"
                          : `Unlist · ${fmtNum(chainPrice, 2)} 0G`}
                    </Button>
                  ) : (
                    <Button
                      leading={<Icon name="tag" size={14} />}
                      onClick={() => setListOpen(true)}
                      disabled={listingBusy || !canListForSale}
                      title={!canListForSale ? "Cancel the rent listing first" : undefined}
                    >
                      List for sale
                    </Button>
                  )}
                  {isListedForRent ? (
                    <Button
                      leading={<Icon name="clock" size={14} />}
                      onClick={submitCancelRent}
                      disabled={listingBusy || !!activeRenter}
                      title={
                        activeRenter
                          ? "Active rental — waits for expiry"
                          : undefined
                      }
                    >
                      {cancelRentListing.isPending
                        ? "Cancel in wallet…"
                        : cancelRentListing.isConfirming
                          ? "Cancelling…"
                          : `Cancel rent · ${fmtNum(rentPriceDisplay, 2)} 0G/day`}
                    </Button>
                  ) : (
                    <Button
                      leading={<Icon name="clock" size={14} />}
                      onClick={() => setRentOpen(true)}
                      disabled={listingBusy || !canListForRent}
                      title={!canListForRent ? "Cancel the sale listing first" : undefined}
                    >
                      Rent out
                    </Button>
                  )}
                  <Button
                    leading={<Icon name="zap" size={14} />}
                    onClick={() => setTrainOpen(true)}
                    title="Re-seal this fighter's persona with new style lines and emit a FighterTrained event"
                  >
                    Train fighter
                  </Button>
                </>
              ) : (
                <>
                  {isViewerActiveRenter ? (
                    <Button
                      variant="primary"
                      leading={<Icon name="sword" size={14} />}
                      onClick={() =>
                        router.push(`/battle/new?fighter=${fighter.id}`)
                      }
                    >
                      Send to battle
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      leading={<Icon name="sword" size={14} />}
                      onClick={() =>
                        gate(`Challenge ${fighter.name}`, () =>
                          router.push(`/battle/new?opponent=${fighter.id}`),
                        )
                      }
                    >
                      Challenge
                    </Button>
                  )}
                  {isListedOnChain && (
                    <Button
                      variant="primary"
                      leading={<Icon name="shop" size={14} />}
                      disabled={buyFighter.isPending || buyFighter.isConfirming}
                      onClick={() =>
                        gate(
                          `Buy ${fighter.name} for ${fmtNum(chainPrice, 2)} 0G`,
                          submitBuy,
                        )
                      }
                    >
                      {buyFighter.isPending
                        ? "Confirm in wallet…"
                        : buyFighter.isConfirming
                          ? "Buying…"
                          : `Buy · ${fmtNum(chainPrice, 2)} 0G`}
                    </Button>
                  )}
                  {isListedForRent && !activeRenter && (
                    <Button
                      leading={<Icon name="clock" size={14} />}
                      disabled={rentFighter.isPending || rentFighter.isConfirming}
                      onClick={() =>
                        gate(`Rent ${fighter.name}`, () => setRentNowOpen(true))
                      }
                    >
                      {rentFighter.isPending
                        ? "Confirm in wallet…"
                        : rentFighter.isConfirming
                          ? "Renting…"
                          : `Rent · ${fmtNum(rentPriceDisplay, 2)} 0G/day`}
                    </Button>
                  )}
                </>
              )}
            </div>
            {(activeRenter || isListedForRent) && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: "var(--bg-sunken)",
                  borderLeft: "2px solid var(--accent)",
                  fontSize: 12,
                  color: "var(--tx-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {activeRenter ? (
                  <>
                    <div style={{ color: "var(--tx-primary)", fontWeight: 500 }}>
                      {isViewerActiveRenter
                        ? "You're renting this fighter"
                        : "Currently rented"}
                    </div>
                    <div>
                      Renter <Hash value={activeRenter} copy /> · expires{" "}
                      {fmtRemaining(rentalExpiresAt)}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ color: "var(--tx-primary)", fontWeight: 500 }}>
                      Open for rent
                      {rentalState?.listing?.disputable ? " · disputable" : ""}
                    </div>
                    <div>
                      {fmtNum(rentPriceDisplay, 3)} 0G per day · up to {rentMaxDuration}{" "}
                      day{rentMaxDuration === 1 ? "" : "s"} per rental.
                    </div>
                  </>
                )}
              </div>
            )}
            {rentalState?.dispute && rentalState.dispute.status !== 0 && (
              <div style={{ marginTop: 14 }}>
                <DisputePanel
                  tokenId={fighter.id}
                  rentalExpiresAt={rentalState.active?.expiresAt ?? null}
                  dispute={rentalState.dispute}
                  viewer={(viewerAddr as Address | undefined) ?? null}
                  onUpdated={() => refetchRental()}
                />
              </div>
            )}
          </Card>

          <Tabs
            value={tab}
            onChange={(v) => setTab(v as DetailTab)}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "history", label: "Battle history", count: fighter.battles },
              { value: "earnings", label: "Earnings" },
            ]}
            style={{ marginBottom: 16 }}
          />

          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <TrainingHistory tokenId={fighter.id} />
              <Card style={{ padding: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <div className="label">Combat traits</div>
                  <div style={{ fontSize: 10, color: "var(--tx-tertiary)" }}>
                    base + battle record
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tx-tertiary)",
                    marginBottom: 12,
                    lineHeight: 1.5,
                  }}
                >
                  HP shifts with win rate · Logic with ELO · Wit with battles fought.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {(
                    [
                      { label: "HP", value: fighter.hp },
                      { label: "Logic", value: fighter.logic },
                      { label: "Wit", value: fighter.wit },
                    ] as const
                  ).map((s) => (
                    <div key={s.label}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 5,
                        }}
                      >
                        <span style={{ color: "var(--tx-secondary)" }}>{s.label}</span>
                        <span className="num" style={{ color: "var(--tx-primary)" }}>
                          {s.value}/100
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: "var(--bg-sunken)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.max(0, Math.min(100, s.value))}%`,
                            background: traitColor(s.value),
                            transition:
                              "width 300ms ease-out, background 200ms ease-out",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card style={{ padding: 20 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <div className="label">Archetype</div>
                  <Badge>{fighter.arch}</Badge>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--tx-secondary)",
                    lineHeight: 1.6,
                  }}
                >
                  {ARCH_BLURBS[fighter.arch] ??
                    "A fighter with its own rhythm. Trained on its own seed; style emerges in combat."}
                </div>
              </Card>

              {fighter.style && fighter.style.length > 0 && (
                <Card style={{ padding: 20 }}>
                  <div className="label" style={{ marginBottom: 12 }}>
                    Signature style
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {fighter.style.map((q, i) => (
                      <div
                        key={i}
                        style={{
                          padding: 12,
                          background: "var(--bg-sunken)",
                          borderLeft: `2px solid ${fighter.color}`,
                          fontSize: 14,
                          color: "var(--tx-primary)",
                          lineHeight: 1.55,
                        }}
                      >
                        {q}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card style={{ padding: 20 }}>
                <div className="label" style={{ marginBottom: 12 }}>Tags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {fighter.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {tab === "history" && (
            <Card>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      background: "var(--bg-sunken)",
                      borderBottom: "1px solid var(--bd-default)",
                    }}
                  >
                    {["Date", "Opponent", "Topic", "Result", "Δ ELO"].map((h) => (
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
                  {recentBattles.map((b) => {
                    const oppId = b.a === fighter.id ? b.b : b.a;
                    const won = b.winner === (b.a === fighter.id ? "a" : "b");
                    return (
                      <tr
                        key={b.id}
                        onClick={() => router.push(`/arenas/${b.id}/result`)}
                        style={{
                          borderBottom: "1px solid var(--bd-subtle)",
                          cursor: "pointer",
                        }}
                      >
                        <td
                          style={{ padding: "12px 14px", color: "var(--tx-tertiary)" }}
                          className="mono"
                        >
                          {b.endedAt ? fmtTime(b.endedAt) : "—"}
                        </td>
                        <td style={{ padding: "12px 14px" }}>Fighter #{oppId}</td>
                        <td
                          style={{
                            padding: "12px 14px",
                            color: "var(--tx-secondary)",
                            maxWidth: 300,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {b.topic}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <Badge tone={won ? "success" : "danger"}>
                            {won ? "Won" : "Lost"}
                          </Badge>
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            fontFamily: "var(--mono)",
                            color: won ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {won ? "+18" : "-14"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {tab === "earnings" && (
            <Card style={{ padding: 20 }}>
              <div className="label" style={{ marginBottom: 12 }}>Lifetime earnings</div>
              {fighter.earnings > 0 ? (
                <div>
                  <div
                    className="num"
                    style={{ fontSize: 28, fontWeight: 700 }}
                  >
                    {fmtNum(fighter.earnings)} 0G
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--tx-secondary)",
                      marginTop: 6,
                    }}
                  >
                    Settled on-chain via BattleRegistry on every won battle.
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="trend"
                  title="No earnings yet"
                  body="This fighter hasn't won any battles. Earnings accrue on-chain via BattleRegistry when it wins and bettors claim payouts."
                />
              )}
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: 18 }}>
            <div className="label" style={{ marginBottom: 10 }}>INFT</div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <span style={{ color: "var(--tx-secondary)" }}>Token ID</span>
              <span className="mono">#{fighter.id}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <span style={{ color: "var(--tx-secondary)" }}>Owner</span>
              <Hash value={fighter.owner} copy />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--tx-secondary)" }}>Status</span>
              <span>
                {isListedOnChain
                  ? `For sale · ${fmtNum(chainPrice, 2)} 0G`
                  : activeRenter
                    ? "Currently rented"
                    : isListedForRent
                      ? `For rent · ${fmtNum(rentPriceDisplay, 3)} 0G/day`
                      : "Not listed"}
              </span>
            </div>
          </Card>
          <Card style={{ padding: 18 }}>
            <div className="label" style={{ marginBottom: 10, color: "var(--success)" }}>
              On-chain attestation
            </div>
            <div style={{ fontSize: 12, color: "var(--tx-secondary)", marginBottom: 12 }}>
              Persona sealed at mint. Verdicts on this fighter are
              TEE-attested per battle (see arena page).
            </div>
            <div style={{ marginBottom: 14 }}>
              <Hash value={fighter.attest} copy />
            </div>
            <Button
              size="sm"
              leading={<Icon name="external" size={12} />}
              onClick={() => {
                // Prefer the real mint tx hash (from server meta) — that's what
                // users want to see. Fall back to the NFT instance page when
                // the tx hash isn't known. Never link the metadataHash; it's
                // keccak(JSON) and won't resolve in the explorer's tx index.
                const base = activeChain.blockExplorers.default.url;
                const contract = FIGHTER_INFT_ADDRESS;
                const url = fighter.mintTxHash
                  ? `${base}/tx/${fighter.mintTxHash}`
                  : contract
                    ? `${base}/token/${contract}/instance/${fighter.id}`
                    : base;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              style={{ width: "100%", justifyContent: "center" }}
            >
              View on 0G Explorer
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        open={listOpen}
        onClose={() => !listingBusy && setListOpen(false)}
        title="List fighter for sale"
        footer={
          <>
            <Button onClick={() => setListOpen(false)} disabled={listingBusy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitListing} disabled={listingBusy}>
              {listFighter.phase === "approving"
                ? "Approving marketplace…"
                : listFighter.phase === "listing"
                  ? "Listing…"
                  : listFighter.isConfirming
                    ? "Confirming tx…"
                    : "List"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Price</div>
            <Input
              type="number"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              trailing={<span className="label">0G</span>}
              min={0}
              step="0.01"
            />
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-tertiary)" }}>
            2.5% platform fee applies on sale. Funds held in escrow by the Marketplace
            contract; proceeds are claimable via Wallet after settlement.
          </div>
        </div>
      </Modal>

      <Modal
        open={rentOpen}
        onClose={() => !listingBusy && setRentOpen(false)}
        title="List fighter for rent"
        footer={
          <>
            <Button onClick={() => setRentOpen(false)} disabled={listingBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={listingBusy}
              onClick={submitListForRent}
            >
              {listForRent.phase === "approving"
                ? "Approving escrow…"
                : listForRent.phase === "listing"
                  ? "Listing…"
                  : listForRent.isConfirming
                    ? "Confirming tx…"
                    : "List for rent"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              background: "var(--bg-sunken)",
              borderRadius: 4,
              fontSize: 12,
              color: "var(--tx-secondary)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--tx-primary)" }}>How rentals work</strong>
            <br />
            Your fighter goes into RentalEscrow custody. Anyone can rent it
            by paying your rate — up to your max duration. Fighter returns to your
            Vault automatically when the rental expires. 2.5% platform fee on rent proceeds.
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Price per day</div>
            <Input
              type="number"
              value={rentPricePerDay}
              onChange={(e) => setRentPricePerDay(e.target.value)}
              trailing={<span className="label">0G / day</span>}
              min={0}
              step="0.001"
            />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Max rental duration</div>
            <Input
              type="number"
              value={rentMaxDays}
              onChange={(e) => setRentMaxDays(Number(e.target.value) || 1)}
              trailing={<span className="label">Days</span>}
              min={1}
              max={365}
            />
            <div style={{ fontSize: 11, color: "var(--tx-tertiary)", marginTop: 4 }}>
              Renters can rent any length up to this cap.
            </div>
          </div>
          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: 12,
              background: "var(--bg-elevated, #161616)",
              borderRadius: 6,
              border: "1px solid var(--border, #2a2a2a)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={rentDisputable}
              onChange={(e) => setRentDisputable(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Enable disputable escrow
              </span>
              <span
                style={{ fontSize: 11, color: "var(--tx-tertiary)" }}
              >
                Funds are held in escrow until the rental ends. Renter has
                24h to accept or dispute; if disputed, parties propose a
                co-signed split. After 7d with no resolution, renter is
                refunded. Untoggled = funds release on rent (default).
              </span>
            </div>
          </label>
          {listForRent.error && (
            <div
              style={{
                padding: 10,
                background: "rgba(232,107,107,0.08)",
                border: "1px solid rgba(232,107,107,0.30)",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--tx-primary)",
                wordBreak: "break-word",
              }}
            >
              {listForRent.error.message}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={rentNowOpen}
        onClose={() =>
          !rentFighter.isPending && !rentFighter.isConfirming && setRentNowOpen(false)
        }
        title={`Rent ${fighter.name}`}
        footer={
          <>
            <Button
              onClick={() => setRentNowOpen(false)}
              disabled={rentFighter.isPending || rentFighter.isConfirming}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={rentFighter.isPending || rentFighter.isConfirming}
              onClick={async () => {
                await submitRent();
                setRentNowOpen(false);
              }}
            >
              {rentFighter.isPending
                ? "Confirm in wallet…"
                : rentFighter.isConfirming
                  ? "Renting…"
                  : `Pay ${fmtNum(
                      rentPriceDisplay * Math.max(1, rentDurationInput),
                      3,
                    )} 0G`}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              background: "var(--bg-sunken)",
              borderRadius: 4,
              fontSize: 12,
              color: "var(--tx-secondary)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--tx-primary)" }}>How renting works</strong>
            <br />
            You pay upfront for your chosen duration. During the rental you can send
            this fighter to battle — earnings flow to your wallet. When the rental
            ends, it returns to the owner's vault automatically.
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Duration
            </div>
            <Input
              type="number"
              value={rentDurationInput}
              onChange={(e) =>
                setRentDurationInput(Math.max(1, Number(e.target.value) || 1))
              }
              trailing={<span className="label">Days</span>}
              min={1}
              max={rentMaxDuration || 1}
            />
            <div style={{ fontSize: 11, color: "var(--tx-tertiary)", marginTop: 4 }}>
              Up to {rentMaxDuration} day{rentMaxDuration === 1 ? "" : "s"} per rental
              · {fmtNum(rentPriceDisplay, 3)} 0G/day.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: 10,
              background: "var(--bg-sunken)",
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--tx-secondary)" }}>Total</span>
            <span className="num" style={{ fontWeight: 600 }}>
              {fmtNum(rentPriceDisplay * Math.max(1, rentDurationInput), 3)} 0G
            </span>
          </div>
          {rentFighter.error && (
            <div
              style={{
                padding: 10,
                background: "rgba(232,107,107,0.08)",
                border: "1px solid rgba(232,107,107,0.30)",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--tx-primary)",
                wordBreak: "break-word",
              }}
            >
              {rentFighter.error.message}
            </div>
          )}
        </div>
      </Modal>

      <TrainModal
        open={trainOpen}
        onClose={() => setTrainOpen(false)}
        tokenId={fighter.id}
        owner={fighter.owner as Address}
        fighterName={fighter.name}
        archetype={fighter.arch}
        priorSignature={fighter.style ?? []}
      />
    </PageContainer>
  );
}
