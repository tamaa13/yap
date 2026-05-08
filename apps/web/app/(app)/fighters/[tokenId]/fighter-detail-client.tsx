"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skel } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/shell/page-container";
import { useFighter } from "@/hooks/use-fighter";
import { useWallet } from "@/hooks/use-wallet";
import { FighterDetail } from "./fighter-detail";

export function FighterDetailClient({ tokenId }: { tokenId: number }) {
  const { data: fighter, isLoading } = useFighter(tokenId);
  const { addr } = useWallet();

  if (isLoading) {
    return (
      <PageContainer>
        <Skel h={160} />
      </PageContainer>
    );
  }

  if (!fighter) {
    return (
      <PageContainer>
        <EmptyState
          icon="alert"
          title="No fighter at that ID"
          body="That tokenId isn't on-chain — either it never minted, or contracts aren't deployed on this network."
          cta={
            <Link href="/market">
              <Button variant="primary">Back to market</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const isMine = !!addr && fighter.owner.toLowerCase() === addr.toLowerCase();
  return <FighterDetail fighter={fighter} isMine={isMine} recentBattles={[]} />;
}
