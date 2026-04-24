import { StatCardSkel, TableSkel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";

export default function WalletLoading() {
  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Wallet</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 24 }}>
        0G balance, earnings, and transaction history.
      </div>
      <div
        className="al-stats-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkel key={i} />
        ))}
      </div>
      <TableSkel rows={8} cols={5} />
    </PageContainer>
  );
}
