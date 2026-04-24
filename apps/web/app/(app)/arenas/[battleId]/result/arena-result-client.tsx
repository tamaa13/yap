"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";
import { useBattle } from "@/hooks/use-battle";
import { useFighter } from "@/hooks/use-fighter";
import { useMyBets } from "@/hooks/use-my-bets";
import { ArenaResult } from "./arena-result";

export function ArenaResultClient({ battleId }: { battleId: string }) {
  const battle = useBattle(battleId);
  const fighterA = useFighter(battle.data?.a);
  const fighterB = useFighter(battle.data?.b);
  const { data: myBets } = useMyBets();

  if (battle.isLoading || fighterA.isLoading || fighterB.isLoading) {
    return (
      <PageContainer>
        <Skel h={24} w="40%" style={{ marginBottom: 14 }} />
        <Skel h={220} />
      </PageContainer>
    );
  }

  if (!battle.data || !fighterA.data || !fighterB.data) {
    return (
      <PageContainer>
        <EmptyState
          icon="alert"
          title="Battle not found"
          cta={
            <Link href="/arenas">
              <Button variant="primary">Back to arenas</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const myWonBet = myBets.find((b) => b.battleId === battle.data!.id && b.status === "won") ?? null;

  return (
    <ArenaResult
      battle={battle.data}
      fighterA={fighterA.data}
      fighterB={fighterB.data}
      myWonBet={myWonBet}
    />
  );
}
