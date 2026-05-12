"use client";

// Marketplace card for a single MomentListing. Composes the same visual
// shell as vault MomentCard (Promoter Card chrome, sigil, badge stripe)
// plus a price line + Buy CTA. Reuses useMomentRoyalty so the card can
// show the creator-royalty cut at a glance before opening the buy modal.

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hash } from "@/components/ui/hash";
import { Sigil } from "@/components/ui/sigil";
import { Split, TokenTag } from "@/components/ui/badge";
import { useMomentRoyalty } from "@/hooks/use-moment-royalty";
import { fmtNum } from "@/lib/format";
import type { MomentListing } from "@/hooks/use-moment-listings";

export function MomentListingCard({
  listing,
  onBuy,
  viewerAddr,
}: {
  listing: MomentListing;
  onBuy: (listing: MomentListing) => void;
  viewerAddr: `0x${string}` | null;
}) {
  const { data: royalty } = useMomentRoyalty(listing.tokenId);
  const isSelf =
    !!viewerAddr &&
    listing.seller.toLowerCase() === viewerAddr.toLowerCase();

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
          gap: 10,
        }}
      >
        <Sigil
          seed={`moment-${listing.battleId}-${listing.roundNo}-${listing.side}`}
          size={56}
          color={
            listing.side === 0
              ? "var(--yap-crimson)"
              : "var(--yap-gold)"
          }
        />
        <TokenTag>#{listing.tokenId}</TokenTag>
      </div>
      <div
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 800,
          fontSize: 22,
          lineHeight: 0.95,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--yap-ink-50)",
        }}
      >
        Round {listing.roundNo}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--yap-ink-300)",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          marginTop: 4,
        }}
      >
        Battle {listing.battleId} · Side {listing.side === 0 ? "A" : "B"} ·
        Fighter #{listing.fighterTokenId}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 12,
          marginTop: 12,
          borderTop: "1px solid var(--yap-ink-700)",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <Split
          k="Buy"
          v={`${fmtNum(listing.price, 4)} 0G`}
          size="sm"
          tone="gold"
        />
        {royalty && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--yap-gold)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Creator royalty {(royalty.royaltyBps / 100).toFixed(2)}%
          </span>
        )}
      </div>

      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--tx-tertiary)",
          letterSpacing: 0.04,
          marginTop: 8,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        Seller <Hash value={listing.seller} />
      </div>

      <Button
        size="sm"
        variant="primary"
        onClick={() => onBuy(listing)}
        disabled={isSelf}
        title={isSelf ? "Can't buy from yourself." : undefined}
        style={{ marginTop: 12 }}
      >
        {isSelf ? "Your listing" : `Buy · ${fmtNum(listing.price, 4)} 0G`}
      </Button>
    </Card>
  );
}
