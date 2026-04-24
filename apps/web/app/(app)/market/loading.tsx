import { FighterCardSkel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";

export default function MarketLoading() {
  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Marketplace</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 24 }}>
        Buy, rent, or auction INFT fighters.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <FighterCardSkel key={i} />
        ))}
      </div>
    </PageContainer>
  );
}
