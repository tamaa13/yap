"use client";

// Minter-only modal for adjusting a Moment's creator-royalty bps.
// Bps slider 0–1000 (0%–10%, MomentINFT-enforced cap). Sticks to 25-bps
// increments so the slider produces clean fractions (0.25%, 0.5%, …, 10%).
//
// Wires into `useSetMomentRoyalty().write` via the parent — keeps tx
// state (pending / confirming / error / toast) up where the source of
// truth lives.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const STEP_BPS = 25;
const MAX_BPS = 1000;

export function EditRoyaltyModal({
  open,
  onClose,
  tokenId,
  currentBps,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  tokenId: number;
  currentBps: number;
  submitting: boolean;
  onSubmit: (bps: number) => Promise<void> | void;
}) {
  const [bps, setBps] = useState(currentBps);

  // Re-sync the slider whenever the modal opens against a moment whose
  // current royalty has been refetched. Without this, a stale local value
  // from a previous moment would leak in.
  useEffect(() => {
    if (open) setBps(currentBps);
  }, [open, currentBps]);

  const pct = bps / 100;
  const pctLabel = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={`Royalty · Moment #${tokenId}`}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={submitting || bps === currentBps}
            onClick={() => {
              void onSubmit(bps);
            }}
          >
            {submitting ? "Updating…" : `Set ${pctLabel}`}
          </Button>
        </>
      }
    >
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
            Royalty rules
          </strong>
          <br />
          Cap is 10% (1000 bps). Default is 2.5% (250 bps) set at mint.
          EIP-2981 — marketplaces that honor the standard (OpenSea,
          Yap, etc.) redirect this cut to you on every secondary sale.
          Self-sales (you sell to yourself) skip the royalty.
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Royalty rate
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 8,
            }}
          >
            <div
              className="num"
              style={{
                fontFamily: "var(--yap-font-display)",
                fontSize: 36,
                fontWeight: 400,
                color: "var(--yap-gold)",
                lineHeight: 1,
                minWidth: 96,
              }}
            >
              {pctLabel}
            </div>
            <input
              type="range"
              min={0}
              max={MAX_BPS}
              step={STEP_BPS}
              value={bps}
              disabled={submitting}
              onChange={(e) => setBps(Number(e.target.value))}
              style={{ flex: 1, accentColor: "var(--yap-crimson)" }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--tx-tertiary)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            <span>0%</span>
            <span>5%</span>
            <span>10% cap</span>
          </div>
        </div>
        {bps !== currentBps && (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--tx-tertiary)",
              letterSpacing: 0.04,
            }}
          >
            From {formatBps(currentBps)} → {pctLabel}
          </div>
        )}
      </div>
    </Modal>
  );
}

function formatBps(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}
