"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRentalDispute } from "@/hooks/use-rental-dispute";
import type { DisputeState } from "@/hooks/use-rental-listing";

interface DisputePanelProps {
  tokenId: number;
  /** ms epoch — the rental's expiresAt. Used to label the windows. */
  rentalExpiresAt: number | null;
  dispute: DisputeState;
  viewer: Address | null;
  onUpdated: () => void;
}

/**
 * Dispute lifecycle panel. Surfaces the current state of a disputable
 * rental and offers the actions appropriate for the viewer + clock
 * position. Permissionless actions (claimTimeout, forceClose) stay
 * visible even when the viewer is unrelated to the rental — keeps
 * neither party able to grief the other by going silent.
 */
export function DisputePanel({
  tokenId,
  rentalExpiresAt,
  dispute,
  viewer,
  onUpdated,
}: DisputePanelProps) {
  const { push } = useToast();
  const ctl = useRentalDispute();
  const [splitOpen, setSplitOpen] = useState(false);
  const [renterShareEth, setRenterShareEth] = useState<string>("0");
  const [ownerShareEth, setOwnerShareEth] = useState<string>(
    formatEther(dispute.escrowed),
  );

  const isRenter =
    viewer != null && viewer.toLowerCase() === dispute.renter.toLowerCase();
  const isOwner =
    viewer != null && viewer.toLowerCase() === dispute.owner.toLowerCase();
  // eslint-disable-next-line react-hooks/purity -- intentional render-time clock read; downstream effects refetch on action
  const now = Date.now();
  const inAcceptanceWindow =
    rentalExpiresAt != null &&
    now >= rentalExpiresAt &&
    now < dispute.disputeWindowEnds;
  const acceptanceWindowClosed = now >= dispute.disputeWindowEnds;
  const maxLifetimeReached = now >= dispute.maxLifetimeEnds;

  const statusLabel = (() => {
    if (dispute.status === 1) {
      if (rentalExpiresAt != null && now < rentalExpiresAt) return "Funded · rental live";
      if (inAcceptanceWindow) return "Awaiting accept / dispute (24h)";
      return "Acceptance window closed · timeout-eligible";
    }
    if (dispute.status === 2) {
      if (maxLifetimeReached) return "Disputed · 7d reached, force-closeable";
      return "In dispute · awaiting co-signed split";
    }
    if (dispute.status === 3) return "Settled";
    return "—";
  })();

  const handle = async (
    label: string,
    fn: () => Promise<`0x${string}`>,
  ) => {
    try {
      const tx = await fn();
      push({
        kind: "success",
        text: `${label} · tx ${tx.slice(0, 10)}…`,
      });
      setTimeout(onUpdated, 2000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : `${label} failed`,
      });
    }
  };

  const submitSplit = async () => {
    let renterWei: bigint;
    let ownerWei: bigint;
    try {
      renterWei = parseEther(renterShareEth || "0");
      ownerWei = parseEther(ownerShareEth || "0");
    } catch {
      push({ kind: "error", text: "Numbers don't parse — check the inputs." });
      return;
    }
    if (renterWei + ownerWei !== dispute.escrowed) {
      push({
        kind: "error",
        text: `Renter + owner must add up to ${formatEther(dispute.escrowed)} 0G — the full escrow.`,
      });
      return;
    }
    await handle("Split proposed", () =>
      ctl.proposeSplit(BigInt(tokenId), renterWei, ownerWei),
    );
    setSplitOpen(false);
  };

  if (dispute.status === 3) {
    return (
      <Card style={{ padding: 14 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          Disputable rental — settled
        </div>
        <div style={{ fontSize: 12, color: "var(--tx-secondary)" }}>
          Funds released. Renter / owner can withdraw via{" "}
          <code>withdrawProceeds()</code>.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div className="label" style={{ marginBottom: 4 }}>
          Disputable rental
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{statusLabel}</div>
        <div style={{ fontSize: 12, color: "var(--tx-secondary)", marginTop: 4 }}>
          Escrowed {formatEther(dispute.escrowed)} 0G · accept window ends{" "}
          {new Date(dispute.disputeWindowEnds).toLocaleString()} · max lifetime{" "}
          {new Date(dispute.maxLifetimeEnds).toLocaleString()}
        </div>
      </div>

      {dispute.status === 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isRenter && inAcceptanceWindow && (
            <Button
              size="sm"
              onClick={() =>
                handle("Rental accepted", () =>
                  ctl.accept(BigInt(tokenId)),
                )
              }
              disabled={ctl.isPending}
            >
              {ctl.pendingAction === "acceptRental"
                ? "Accepting…"
                : "Accept rental → release to owner"}
            </Button>
          )}
          {isRenter && inAcceptanceWindow && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                handle("Dispute opened", () =>
                  ctl.dispute(BigInt(tokenId)),
                )
              }
              disabled={ctl.isPending}
            >
              {ctl.pendingAction === "disputeRental"
                ? "Opening dispute…"
                : "Dispute"}
            </Button>
          )}
          {acceptanceWindowClosed && (
            <Button
              size="sm"
              onClick={() =>
                handle("Timeout claimed", () =>
                  ctl.claimTimeout(BigInt(tokenId)),
                )
              }
              disabled={ctl.isPending}
            >
              {ctl.pendingAction === "claimRentalTimeout"
                ? "Claiming…"
                : "Claim timeout → release to owner"}
            </Button>
          )}
          {maxLifetimeReached && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                handle("Force closed", () =>
                  ctl.forceClose(BigInt(tokenId)),
                )
              }
              disabled={ctl.isPending}
            >
              Force close (7d)
            </Button>
          )}
        </div>
      )}

      {dispute.status === 2 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(isRenter || isOwner) && (
            <Button
              size="sm"
              onClick={() => setSplitOpen(true)}
              disabled={ctl.isPending}
            >
              Propose split
            </Button>
          )}
          {maxLifetimeReached && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                handle("Force closed (refund renter)", () =>
                  ctl.forceClose(BigInt(tokenId)),
                )
              }
              disabled={ctl.isPending}
            >
              Force close → refund renter
            </Button>
          )}
        </div>
      )}

      {ctl.error && (
        <div
          style={{
            padding: 8,
            background: "rgba(232,107,107,0.08)",
            border: "1px solid rgba(232,107,107,0.30)",
            borderRadius: 4,
            fontSize: 12,
            wordBreak: "break-word",
          }}
        >
          {ctl.error.message}
        </div>
      )}

      <Modal
        open={splitOpen}
        onClose={() => !ctl.isPending && setSplitOpen(false)}
        title="Propose a split"
        footer={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => setSplitOpen(false)} disabled={ctl.isPending}>
              Back out
            </Button>
            <Button onClick={submitSplit} disabled={ctl.isPending}>
              {ctl.pendingAction === "proposeRentalSplit"
                ? "Sending it on-chain…"
                : "Send proposal"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--tx-secondary)" }}>
            Total escrowed: {formatEther(dispute.escrowed)} 0G. Both fields
            must sum exactly to this amount. The contract auto-settles when
            the other party submits a matching split. Last write wins —
            re-proposing replaces your prior offer.
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              To renter
            </div>
            <Input
              type="number"
              value={renterShareEth}
              onChange={(e) => setRenterShareEth(e.target.value)}
              trailing={<span className="label">0G</span>}
              min={0}
              step="0.0001"
            />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              To owner
            </div>
            <Input
              type="number"
              value={ownerShareEth}
              onChange={(e) => setOwnerShareEth(e.target.value)}
              trailing={<span className="label">0G</span>}
              min={0}
              step="0.0001"
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>
            Platform fee is taken proportional to the owner&apos;s share, so
            a 100% renter refund costs zero fee.
          </div>
        </div>
      </Modal>
    </Card>
  );
}
