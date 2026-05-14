"use client";

// Vault card for a Moment INFT. Wraps the visual block that previously
// lived inline in vault/page.tsx so we can layer royalty surface on top:
//
//   - Always-on: tiny "Creator royalty: N%" mono line beneath the
//     fighter ref. Pulled from MomentINFT.getRoyaltyInfo via
//     useMomentRoyalty — returns null pre-redeploy, in which case
//     the line stays hidden (graceful degrade).
//   - Minter-only: "Edit royalty" button when viewer == recorded minter.
//     Opens an EditRoyaltyModal with 0–10% slider that calls
//     MomentINFT.setRoyalty. Contract enforces the same minter-only
//     auth, so the UI gate doubles as a UX hint, not a security claim.
//
// Reused by the existing vault grid; future Moment marketplace card
// can compose the same component for a single point of truth.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sigil } from "@/components/ui/sigil";
import { useToast } from "@/components/ui/toast";
import { useListMoment } from "@/hooks/use-list-moment";
import { useMomentListing } from "@/hooks/use-moment-listing";
import { battleArenaPath, type OwnedMoment } from "@/hooks/use-my-moments";
import {
  useMomentRoyalty,
  useSetMomentRoyalty,
} from "@/hooks/use-moment-royalty";
import { EditRoyaltyModal } from "./edit-royalty-modal";
import { ListMomentModal } from "./list-moment-modal";

export function MomentCard({
  moment,
  viewerAddr,
}: {
  moment: OwnedMoment;
  viewerAddr: `0x${string}` | null;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const { push } = useToast();
  const { data: royalty } = useMomentRoyalty(moment.tokenId);
  const setRoyalty = useSetMomentRoyalty();
  const isMinter =
    !!royalty &&
    !!viewerAddr &&
    royalty.minter.toLowerCase() === viewerAddr.toLowerCase();
  // Marketplace state. The card is only mounted from the vault grid's
  // owned-moments enumeration (useMyMoments verifies ownerOf), so any
  // viewerAddr that lands here is by definition the current owner —
  // no extra ownerOf round-trip needed for the gate.
  const list = useListMoment();
  const { data: listing, refetch: refetchListing } = useMomentListing(
    moment.tokenId,
  );
  const alreadyListed = listing?.active === true;
  const listSubmitting = list.isPending || list.isConfirming;
  const listPhaseLabel: string | null =
    list.phase === "approving"
      ? "Approving marketplace"
      : list.phase === "listing"
        ? "Listing on-chain"
        : null;

  const onList = async (priceEth: string) => {
    try {
      await list.write({ tokenId: moment.tokenId, priceEth });
      setListOpen(false);
      push({
        kind: "success",
        text: `Moment #${moment.tokenId} listed at ${priceEth} OG.`,
      });
      // Refetch listing so the button row switches to the "Listed"
      // badge without requiring a page reload.
      void refetchListing();
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "List failed",
      });
    }
  };

  return (
    <>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <Sigil
            seed={`moment-${moment.battleId}-${moment.roundNo}-${moment.side}`}
            size={56}
            color={moment.side === 0 ? "var(--fighter-a)" : "var(--fighter-b)"}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Moment #{moment.tokenId}
            </div>
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--tx-tertiary)",
                marginTop: 2,
                letterSpacing: 0.04,
              }}
            >
              Battle {moment.battleId} · R{moment.roundNo} ·{" "}
              {moment.side === 0 ? "A" : "B"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--tx-secondary)",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              Fighter #{moment.fighterTokenId}
            </div>
            {royalty && (
              <div
                className="mono"
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "var(--yap-gold)",
                }}
              >
                Creator royalty: {formatBps(royalty.royaltyBps)}
                {isMinter && (
                  <span
                    style={{
                      marginLeft: 6,
                      color: "var(--yap-ink-400)",
                      fontSize: 10,
                    }}
                  >
                    (you mint)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 14,
          }}
        >
          <Button
            size="sm"
            onClick={() => router.push(battleArenaPath(moment.battleId))}
            style={{ flex: 1, minWidth: 0 }}
          >
            Battle
          </Button>
          <Button
            size="sm"
            onClick={() => router.push(`/fighters/${moment.fighterTokenId}`)}
            style={{ flex: 1, minWidth: 0 }}
          >
            Fighter
          </Button>
          {viewerAddr && !alreadyListed && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setListOpen(true)}
              disabled={listSubmitting}
              style={{ flex: 1, minWidth: 0 }}
            >
              {listSubmitting ? listPhaseLabel ?? "Working" : "List"}
            </Button>
          )}
          {alreadyListed && listing && (
            <div
              className="mono"
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 10,
                color: "var(--accent)",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 6px",
                border: "1px solid var(--accent-border)",
                borderRadius: 4,
              }}
              title={`Listed by ${listing.seller}`}
            >
              Listed · <span className="num" style={{ marginLeft: 4 }}>{listing.price}</span>
              <span style={{ marginLeft: 4 }}>OG</span>
            </div>
          )}
          {isMinter && (
            <Button
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={setRoyalty.isPending || setRoyalty.isConfirming}
              style={{ flex: 1, minWidth: 0 }}
            >
              Royalty
            </Button>
          )}
        </div>
      </Card>
      {isMinter && royalty && (
        <EditRoyaltyModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          tokenId={moment.tokenId}
          currentBps={royalty.royaltyBps}
          submitting={setRoyalty.isPending || setRoyalty.isConfirming}
          onSubmit={async (bps) => {
            try {
              const tx = await setRoyalty.write({
                tokenId: moment.tokenId,
                royaltyBps: bps,
              });
              push({
                kind: "success",
                text: `Royalty set to ${formatBps(bps)} · tx ${tx.slice(0, 10)}…`,
              });
              setEditOpen(false);
            } catch (e) {
              push({
                kind: "error",
                text:
                  e instanceof Error ? e.message : "Royalty update failed",
              });
            }
          }}
        />
      )}
      {viewerAddr && !alreadyListed && (
        <ListMomentModal
          open={listOpen}
          onClose={() => setListOpen(false)}
          tokenId={moment.tokenId}
          submitting={listSubmitting}
          phaseLabel={listPhaseLabel}
          onSubmit={onList}
        />
      )}
    </>
  );
}

function formatBps(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}
