import { CardSkel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";

export default function ArenasLoading() {
  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, letterSpacing: "-0.01em", marginBottom: 4 }}>Arenas</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 24 }}>
        Browse live and upcoming battles.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 12,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkel key={i} />
        ))}
      </div>
    </PageContainer>
  );
}
