"use client";

// Listing modal for Battle Moments — collects an OG price + drives the
// two-step `useListMoment` flow (approve marketplace operator → list).
// Caller owns the tx state; modal just gathers the price input and
// surfaces transient phase copy.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export function ListMomentModal({
  open,
  onClose,
  tokenId,
  submitting,
  phaseLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  tokenId: number;
  submitting: boolean;
  /** "Approving marketplace…" / "Listing…" / null. Caller-derived. */
  phaseLabel?: string | null;
  onSubmit: (priceEth: string) => Promise<void> | void;
}) {
  const [price, setPrice] = useState("");

  // Reset price field whenever the modal re-opens against a different
  // moment. Prevents a stale value from the previous list session
  // leaking in.
  useEffect(() => {
    if (open) setPrice("");
  }, [open, tokenId]);

  const priceNum = Number(price);
  const valid = price.length > 0 && Number.isFinite(priceNum) && priceNum > 0;

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={`List Moment #${tokenId}`}
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <Button
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={submitting || !valid}
            onClick={() => void onSubmit(price)}
          >
            {submitting ? "Working…" : "List"}
          </Button>
        </div>
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          fontSize: 13,
          color: "var(--tx-secondary)",
          lineHeight: 1.5,
        }}
      >
        <div>
          Set an asking price in OG. Listing requires two signatures:
          one-time marketplace approval (skipped if already approved
          on this collection) and the listing itself.
        </div>
        <div>
          <label
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--tx-tertiary)",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 6,
              display: "block",
            }}
          >
            Price · OG
          </label>
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="0.05"
            value={price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPrice(e.target.value)
            }
            disabled={submitting}
          />
        </div>
        {phaseLabel && (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--accent)",
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            {phaseLabel}…
          </div>
        )}
      </div>
    </Modal>
  );
}
