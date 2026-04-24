import { ArenaLiveClient } from "./arena-live-client";

export default async function ArenaLivePage({
  params,
}: {
  params: Promise<{ battleId: string }>;
}) {
  const { battleId } = await params;
  return <ArenaLiveClient battleId={battleId} />;
}
