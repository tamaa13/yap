import { FighterCardSkel, StatCardSkel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";

export default function VaultLoading() {
  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Vault</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 24 }}>
        Your fighters, rentals, bets, and on-chain history.
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <FighterCardSkel key={i} />
        ))}
      </div>
    </PageContainer>
  );
}
