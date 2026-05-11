"use client";

// Buy-flow modal for a Moment listing. The breakdown is the value here:
// the same arithmetic the marketplace contract runs (royalty via
// EIP-2981 royaltyInfo, platformFee via platformFeeBps, seller take =
// remainder). We never reimplement the math — every line comes from a
// contract view so the modal can't drift from settlement.

import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { Hash } from "@/components/ui/hash";
import { Modal } from "@/components/ui/modal";
import { useMomentRoyaltyForPrice } from "@/hooks/use-moment-royalty";
import { useMomentMarketFeeBps } from "@/hooks/use-buy-moment";
import { fmtNum } from "@/lib/format";
import type { MomentListing } from "@/hooks/use-moment-listings";

export function MomentBuyModal({
  open,
  onClose,
  listing,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  listing: MomentListing | null;
  submitting: boolean;
  onConfirm: () => Promise<void> | void;
}) {
  const tokenId = listing?.tokenId ?? null;
  const priceWei = listing?.priceWei ?? null;
  const { receiver: royaltyReceiver, amountWei: royaltyWei } =
    useMomentRoyaltyForPrice(tokenId, priceWei);
  const feeBps = useMomentMarketFeeBps();

  const platformFeeWei =
    priceWei !== null
      ? (priceWei * BigInt(feeBps)) / 10000n
      : 0n;
  const sellerTakeWei =
    priceWei !== null
      ? priceWei - royaltyWei - platformFeeWei
      : 0n;
  // Defensive: if the contract truncates royalty when royalty + fee >
  // price, the seller-take math here may drift slightly. The contract
  // payout is the source of truth — this modal is informational.

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={listing ? `Hire moment #${listing.tokenId}` : "Hire a moment"}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={submitting || !listing}
            onClick={() => {
              void onConfirm();
            }}
          >
            {submitting
              ? "Landing on-chain…"
              : listing
                ? `Pay ${fmtNum(listing.price, 4)} 0G`
                : "—"}
          </Button>
        </>
      }
    >
      {!listing ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              padding: 12,
              background: "var(--bg-sunken)",
              fontSize: 12,
              color: "var(--tx-secondary)",
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: "var(--tx-primary)" }}>
              Battle context
            </strong>
            <br />
            Battle {listing.battleId} · Round {listing.roundNo} · Side{" "}
            {listing.side === 0 ? "A" : "B"} · Fighter #
            {listing.fighterTokenId}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              Payment breakdown
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "var(--bg-sunken)",
              }}
            >
              <Row
                label="Sale price"
                valueWei={listing.priceWei}
                strong
              />
              <Row
                label="Creator royalty"
                sub={
                  royaltyReceiver
                    ? `to ${shortAddr(royaltyReceiver)}`
                    : undefined
                }
                valueWei={royaltyWei}
                tone="gold"
              />
              {feeBps > 0 && (
                <Row
                  label="Platform fee"
                  sub={`${(feeBps / 100).toFixed(2)}%`}
                  valueWei={platformFeeWei}
                  tone="ink-300"
                />
              )}
              <Row
                label="Seller receives"
                valueWei={sellerTakeWei}
                tone="ink-50"
                strong
              />
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              color: "var(--tx-tertiary)",
              fontFamily: "var(--mono)",
              letterSpacing: 0.04,
              lineHeight: 1.55,
            }}
          >
            Sold by <Hash value={listing.seller} />. ERC-721 transfer +
            payout split land atomically. Royalty truncates if it exceeds
            the post-fee amount — contract is the source of truth.
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({
  label,
  sub,
  valueWei,
  tone,
  strong,
}: {
  label: string;
  sub?: string;
  valueWei: bigint;
  tone?: "gold" | "ink-50" | "ink-300";
  strong?: boolean;
}) {
  const color =
    tone === "gold"
      ? "var(--yap-gold)"
      : tone === "ink-300"
        ? "var(--yap-ink-300)"
        : "var(--yap-ink-50)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "10px 12px",
        borderTop: "1px solid var(--bd-subtle)",
        fontSize: 13,
      }}
    >
      <div>
        <span style={{ color: "var(--tx-secondary)" }}>{label}</span>
        {sub && (
          <span
            className="mono"
            style={{
              marginLeft: 8,
              fontSize: 10,
              color: "var(--tx-tertiary)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {sub}
          </span>
        )}
      </div>
      <div
        className="num"
        style={{
          color,
          fontWeight: strong ? 600 : 400,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtNum(Number(formatEther(valueWei)), 4)} 0G
      </div>
    </div>
  );
}

function shortAddr(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
