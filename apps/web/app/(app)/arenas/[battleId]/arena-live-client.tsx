"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";
import { useBattle } from "@/hooks/use-battle";
import { useFighter } from "@/hooks/use-fighter";
import { ArenaLive } from "./arena-live";
import { ArenaPending } from "./arena-pending";

export function ArenaLiveClient({ battleId }: { battleId: string }) {
  const battle = useBattle(battleId);
  const fighterA = useFighter(battle.data?.a);
  const fighterB = useFighter(battle.data?.b);

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
          body="This battle doesn't exist on-chain yet, or the contracts aren't deployed."
          cta={
            <Link href="/arenas">
              <Button variant="primary">Back to arenas</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  // Pending (challenge awaiting defender): distinct UI with accept/decline
  // for the defender, waiting state for the challenger.
  if (battle.data.status === "upcoming") {
    return (
      <ArenaPending
        uiId={battleId}
        battle={battle.data}
        fighterA={fighterA.data}
        fighterB={fighterB.data}
      />
    );
  }

  return (
    <ArenaLive
      battle={battle.data}
      fighterA={fighterA.data}
      fighterB={fighterB.data}
      scriptedArgs={[]}
    />
  );
}
