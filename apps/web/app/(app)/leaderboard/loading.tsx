import { TableSkel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";

export default function LeaderboardLoading() {
  return (
    <PageContainer>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Leaderboard</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 24 }}>
        Global rankings across all fighters.
      </div>
      {/* 7 cols: #, Fighter (Sigil+name), Archetype, ELO, Win %, Earnings, Owner */}
      <TableSkel
        rows={10}
        cols={7}
        widths={[40, "flex", 100, 70, 60, 90, 130]}
        fighterCol={1}
      />
    </PageContainer>
  );
}
