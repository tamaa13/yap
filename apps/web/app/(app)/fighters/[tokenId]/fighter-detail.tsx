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
import { useFighterMintTx } from "@/hooks/use-fighter-mint-tx";
import { useListFighter } from "@/hooks/use-list-fighter";
import { useListForRent } from "@/hooks/use-list-for-rent";
import { useListing } from "@/hooks/use-listing";
import { useRentalListing } from "@/hooks/use-rental-listing";
import { useCancelRentListing, useRentFighter } from "@/hooks/use-rent-fighter";
import { useReleaseSubname, useSubname } from "@/hooks/use-subname";
import { useWalletGate, useWallet } from "@/hooks/use-wallet";
import { activeChain } from "@/lib/chains";
import { FIGHTER_INFT_ADDRESS, YAP_SUBNAME_ADDRESS } from "@/lib/contracts";
import { BattleHistoryTable } from "./battle-history-table";
import { AccessLogTable } from "./access-log-table";
import { DisputePanel } from "./dispute-panel";
import { SubnameModal } from "./subname-modal";
import { useFighterAccessCount } from "@/hooks/use-fighter-access-log";
import { fmtNum, fmtRemaining, fmtTime } from "@/lib/format";
import type { Address } from "viem";
import type { Battle, Fighter, FighterArchetype } from "@/lib/types";

type DetailTab = "overview" | "history" | "earnings" | "access";

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
  // Lightweight access count for the tab badge — uses the view, not the
  // event scan, so the tab can render its badge without paying for the
  // full log fetch until the tab is actually opened.
  const accessCount = useFighterAccessCount(fighter.id);
  const [listOpen, setListOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false); // owner: list for rent
  const [subnameOpen, setSubnameOpen] = useState(false); // owner: claim a <label>.yap.0g
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
  const { label: subnameLabel, fullName: subnameFullName, refetch: refetchSubname } =
    useSubname(fighter.id);
  const releaseSubname = useReleaseSubname();

  // For legacy fighters whose server meta lost mintTxHash, recover it from
  // the on-chain Minted event so "View on 0G Explorer" still lands on a
  // real tx page instead of the contract address fallback. No-op (returns
  // undefined immediately) when fighter.mintTxHash is already known.
  const { mintTxHash: recoveredMintTx, isLoading: recoveredMintTxLoading } =
    useFighterMintTx(fighter.mintTxHash ? null : fighter.id);

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
      push({ kind: "error", text: "Price needs to be a positive 0G amount." });
      return;
    }
    try {
      const txHash = await listFighter.write({
        tokenId: fighter.id,
        priceEth: price,
      });
      push({ kind: "success", text: `On the block at ${price} 0G · tx ${txHash.slice(0, 10)}…` });
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
      push({ kind: "success", text: `Pulled the listing · tx ${txHash.slice(0, 10)}…` });
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
      push({ kind: "error", text: "Listing's gone — someone beat you to it." });
      return;
    }
    try {
      const txHash = await buyFighter.write({
        tokenId: fighter.id,
        priceWei: chainPriceWei,
      });
      push({
        kind: "success",
        text: `Fighter is yours · tx ${txHash.slice(0, 10)}…`,
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
      push({ kind: "error", text: "Daily rate needs to be a positive 0G amount." });
      return;
    }
    if (!Number.isFinite(rentMaxDays) || rentMaxDays <= 0 || rentMaxDays > 365) {
      push({ kind: "error", text: "Max rental window has to be 1–365 days." });
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
        text: `Out for hire at ${ppd} 0G/day · tx ${tx.slice(0, 10)}…`,
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
        text: `Pulled the rental · tx ${tx.slice(0, 10)}…`,
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
      push({ kind: "error", text: "Rental's gone — someone beat you to it." });
      return;
    }
    if (
      !Number.isFinite(rentDurationInput) ||
      rentDurationInput <= 0 ||
      rentDurationInput > rentMaxDuration
    ) {
      push({
        kind: "error",
        text: `Pick 1–${rentMaxDuration} days. Owner caps it there.`,
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
        text: `Fighter under your command for ${rentDurationInput} day${rentDurationInput === 1 ? "" : "s"} · tx ${tx.slice(0, 10)}…`,
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
                    marginBottom: subnameLabel ? 6 : 12,
                    textTransform: "capitalize",
                  }}
                >
                  {fighter.arch}
                </div>
                {subnameFullName && (
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--mono)",
                      color: "var(--accent)",
                      marginBottom: 12,
                      letterSpacing: 0.04,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 99,
                        background: "var(--accent)",
                      }}
                    />
                    {subnameFullName}
                  </div>
                )}
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
                      {fmtNum(fighter.earnings, 4)} 0G
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
                    Into the ring
                  </Button>
                  {isListedOnChain ? (
                    <Button
                      leading={<Icon name="tag" size={14} />}
                      onClick={submitUnlist}
                      disabled={listingBusy}
                    >
                      {cancelListing.isPending
                        ? "Sign in your wallet…"
                        : cancelListing.isConfirming
                          ? "Pulling the listing…"
                          : `Pull listing · ${fmtNum(chainPrice, 2)} 0G`}
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
                  {YAP_SUBNAME_ADDRESS !== "" && (
                    <Button
                      leading={<Icon name="tag" size={14} />}
                      onClick={() => setSubnameOpen(true)}
                      title={
                        subnameLabel
                          ? `Manage ${subnameFullName}`
                          : "Claim a <label>.yap.0g name for this fighter"
                      }
                    >
                      {subnameLabel ? "Manage name" : "Claim name"}
                    </Button>
                  )}
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
                        ? "Sign in your wallet…"
                        : buyFighter.isConfirming
                          ? "Locking the buy…"
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
                        ? "Sign in your wallet…"
                        : rentFighter.isConfirming
                          ? "Locking the rental…"
                          : `Hire · ${fmtNum(rentPriceDisplay, 2)} 0G/day`}
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
              { value: "access", label: "Access log", count: accessCount },
            ]}
            style={{ marginBottom: 16 }}
          />

          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card style={{ padding: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <div className="label">Persona traits</div>
                  <div style={{ fontSize: 10, color: "var(--tx-tertiary)" }}>
                    TEE-attested at mint
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
                  {fighter.traits
                    ? "Logos / Rhetoric / Aggression scored by the TEE judge. Range + Concrete computed deterministically from the seed."
                    : "This fighter pre-dates persona scoring. Re-mint to attest 5-trait scores on-chain."}
                </div>
                {fighter.traits ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {(
                      [
                        { label: "Logos", value: fighter.traits.logos, hint: "Argument structure" },
                        { label: "Rhetoric", value: fighter.traits.rhetoric, hint: "Vividness, voice" },
                        { label: "Aggression", value: fighter.traits.aggression, hint: "Stance strength" },
                        { label: "Range", value: fighter.traits.range, hint: "Lexical diversity" },
                        { label: "Concrete", value: fighter.traits.concreteness, hint: "Sensory framing" },
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
                          <span style={{ color: "var(--tx-secondary)" }}>
                            {s.label}
                            <span
                              style={{
                                color: "var(--tx-tertiary)",
                                fontSize: 11,
                                marginLeft: 6,
                              }}
                            >
                              · {s.hint}
                            </span>
                          </span>
                          <span className="num" style={{ color: "var(--tx-primary)" }}>
                            {s.value}/5
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
                              // Map the 1-5 trait band onto the same 0-100
                              // bar width the previous HP/Logic/Wit display
                              // used so the color ramp + transition feel
                              // is consistent across the page.
                              width: `${Math.max(0, Math.min(100, (s.value / 5) * 100))}%`,
                              background: traitColor((s.value / 5) * 100),
                              transition:
                                "width 300ms ease-out, background 200ms ease-out",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 14,
                      background: "var(--bg-sunken)",
                      border: "1px dashed var(--bd-default)",
                      borderRadius: 4,
                      textAlign: "center",
                    }}
                  >
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        color: "var(--tx-tertiary)",
                        marginBottom: 4,
                      }}
                    >
                      Legacy fighter · unscored
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--tx-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      Trait commitment landed in Phase 4; this fighter
                      minted before that. Abilities stay locked because
                      the gate read is all zeros on-chain.
                    </div>
                  </div>
                )}
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
            <BattleHistoryTable battles={recentBattles} fighterId={fighter.id} />
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
                    {fmtNum(fighter.earnings, 4)} 0G
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
              ) : fighter.w > 0 ? (
                // Fighter has settled wins on the registry but earnings is
                // still 0. Pre-royalty-cascade redeploy this is expected —
                // royalty splits weren't accruing into the fighter's
                // earnings counter yet. Honest copy beats the old "no wins"
                // line, which was factually wrong on any fighter with a W.
                <EmptyState
                  icon="trend"
                  title="Wins on record, royalty pending"
                  body="Settled battles will accrue here once the royalty cascade is live and bettors claim out. The wins themselves are already on-chain via BattleRegistry."
                />
              ) : (
                <EmptyState
                  icon="trend"
                  title="Empty purse, for now"
                  body="No wins, no winnings yet. Earnings stack up on-chain via BattleRegistry once this fighter takes a round and the bettors claim out."
                />
              )}
            </Card>
          )}

          {tab === "access" && <AccessLogTable fighterId={fighter.id} />}
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
              <span style={{ fontFamily: "var(--yap-font-mono)", fontSize: 12 }}>#{fighter.id}</span>
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
                // Prefer the real mint tx hash (from server meta) → fall back
                // to chain-recovered Minted event tx (for legacy fighters
                // whose meta got lost) → finally the contract address page.
                // Never the /token/<addr>/instance/<id> URL — chainscan-galileo
                // returns the SPA shell for that path and renders 404 client-
                // side. Never the metadataHash either; it's keccak(JSON) and
                // won't resolve in any explorer index.
                const base = activeChain.blockExplorers.default.url;
                const contract = FIGHTER_INFT_ADDRESS;
                const txHash = fighter.mintTxHash ?? recoveredMintTx;
                const url = txHash
                  ? `${base}/tx/${txHash}`
                  : contract
                    ? `${base}/address/${contract}`
                    : base;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              disabled={recoveredMintTxLoading && !fighter.mintTxHash}
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
        title="Put this fighter on the block"
        footer={
          <>
            <Button onClick={() => setListOpen(false)} disabled={listingBusy}>
              Back out
            </Button>
            <Button variant="primary" onClick={submitListing} disabled={listingBusy}>
              {listFighter.phase === "approving"
                ? "Approving marketplace…"
                : listFighter.phase === "listing"
                  ? "Posting…"
                  : listFighter.isConfirming
                    ? "Landing on-chain…"
                    : "Post the listing"}
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
            2.5% platform fee on sale. Marketplace escrow holds funds;
            you claim proceeds from the Wallet page once it settles.
          </div>
        </div>
      </Modal>

      <Modal
        open={rentOpen}
        onClose={() => !listingBusy && setRentOpen(false)}
        title="Put this fighter up for hire"
        footer={
          <>
            <Button onClick={() => setRentOpen(false)} disabled={listingBusy}>
              Back out
            </Button>
            <Button
              variant="primary"
              disabled={listingBusy}
              onClick={submitListForRent}
            >
              {listForRent.phase === "approving"
                ? "Approving escrow…"
                : listForRent.phase === "listing"
                  ? "Posting…"
                  : listForRent.isConfirming
                    ? "Landing on-chain…"
                    : "Post the rental"}
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
            Your fighter goes into RentalEscrow custody. Anyone can hire it at
            your rate up to the cap you set. It returns to your Vault the
            instant the rental expires. 2.5% platform fee on the take.
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
              background: "var(--bg-raised)",
              borderRadius: 6,
              border: "1px solid var(--bd-default)",
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
                Funds stay in escrow until the rental wraps. Renter has 24h
                to accept or dispute. Disputes settle with a co-signed split;
                no resolution in 7d refunds the renter. Off = funds release
                on rent (default).
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
        title={`Hire ${fighter.name}`}
        footer={
          <>
            <Button
              onClick={() => setRentNowOpen(false)}
              disabled={rentFighter.isPending || rentFighter.isConfirming}
            >
              Back out
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
                ? "Sign in your wallet…"
                : rentFighter.isConfirming
                  ? "Locking the rental…"
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
            <strong style={{ color: "var(--tx-primary)" }}>How hiring works</strong>
            <br />
            Pay upfront for your window. While it's yours, send the fighter
            into battle and the winnings hit your wallet. The moment the
            window closes, the fighter snaps back to the owner's vault.
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

      <SubnameModal
        open={subnameOpen}
        onClose={() => setSubnameOpen(false)}
        tokenId={fighter.id}
        currentLabel={subnameLabel}
        currentFullName={subnameFullName}
        onChanged={refetchSubname}
        releaseSubname={releaseSubname}
      />
    </PageContainer>
  );
}
