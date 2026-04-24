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
          title="404 · Page not found"
          body="The route you're looking for doesn't exist."
          cta={
            <Link href="/">
              <Button variant="primary">Back home</Button>
            </Link>
          }
        />
      </PageContainer>
    </>
  );
}
