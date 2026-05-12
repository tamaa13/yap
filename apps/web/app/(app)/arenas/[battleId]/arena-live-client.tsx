"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";
import { useBattle } from "@/hooks/use-battle";
import { useFighter } from "@/hooks/use-fighter";
import { ArenaLive } from "./arena-live";
import { ArenaPending } from "./arena-pending";

export function ArenaLiveClient({ battleId }: { battleId: string }) {
  const router = useRouter();
  const battle = useBattle(battleId);
  const fighterA = useFighter(battle.data?.a);
  const fighterB = useFighter(battle.data?.b);

  // Settled battles route to the verdict reveal showpiece. Live → past
  // transition triggers an auto-redirect (user was watching live as the
  // bell rang on the final round); cold-load on a past battle also
  // lands on the result page directly. Keeping the live route would
  // strand users on stale state with bet bar closed and no verdict UI.
  useEffect(() => {
    if (battle.data?.status === "past") {
      router.replace(`/arenas/${battleId}/result`);
    }
  }, [battle.data?.status, battleId, router]);

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
          title="Battle's a ghost"
          body="No record on-chain — either it's not propagated yet, or the contracts aren't deployed on this network."
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
