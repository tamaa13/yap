import { TableSkel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";

export default function LeaderboardLoading() {
  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Leaderboard</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 24 }}>
        Global rankings across all fighters.
      </div>
      <TableSkel rows={10} cols={8} />
    </PageContainer>
  );
}
