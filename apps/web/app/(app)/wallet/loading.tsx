import { Skel, StatCardSkel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";

export default function WalletLoading() {
  return (
    <PageContainer>
      {/* H1 is uppercase display-2 ~40px (matches the loaded heading) */}
      <Skel w={120} h={40} style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 20 }}>
        0G balance, earnings, and transaction history.
      </div>

      {/* 3 stat cards (Balance / Locked in bets / Lifetime P/L). The
          loaded grid is `repeat(3, 1fr)`, NOT 4 — the prior 4-col
          placeholder pushed every card narrower than the real layout. */}
      <div
        className="al-stats-grid-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCardSkel />
        <StatCardSkel />
        <StatCardSkel />
      </div>

      {/* Balance Card — padding 20, "Balance" label (mb 12), big 40px
          numeric balance (mb 0), small mono address (mb 16), copy CTA. */}
      <div
        style={{
          padding: 20,
          background: "var(--yap-ink-800)",
          border: "1px solid var(--yap-ink-600)",
          marginBottom: 20,
        }}
      >
        <Skel w={68} h={11} style={{ marginBottom: 12 }} />
        <Skel w={160} h={40} style={{ marginBottom: 6 }} />
        <Skel w={200} h={12} style={{ marginBottom: 16 }} />
        <Skel w={130} h={32} />
      </div>

      <Skel w={150} h={11} style={{ marginBottom: 12 }} />
      {/* Empty-state placeholder block — loaded view currently renders
          `<EmptyState>` here, not a real history table. */}
      <div
        style={{
          padding: 36,
          background: "var(--yap-ink-800)",
          border: "1px solid var(--yap-ink-600)",
          textAlign: "center",
        }}
      >
        <Skel w={160} h={14} style={{ margin: "0 auto 8px" }} />
        <Skel w={260} h={12} style={{ margin: "0 auto" }} />
      </div>
    </PageContainer>
  );
}
