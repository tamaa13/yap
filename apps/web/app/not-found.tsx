import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/shell/page-container";
import { TopNav } from "@/components/shell/top-nav";

export default function NotFound() {
  return (
    <>
      <TopNav />
      <PageContainer>
        <EmptyState
          icon="alert"
          title="404 · Off the map"
          body="Whatever you were chasing isn't here. Head back."
          cta={
            <Link href="/">
              <Button variant="primary">Back to the arena</Button>
            </Link>
          }
        />
      </PageContainer>
    </>
  );
}
