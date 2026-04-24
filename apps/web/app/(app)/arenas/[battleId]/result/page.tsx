import { ArenaResultClient } from "./arena-result-client";

export default async function ArenaResultPage({
  params,
}: {
  params: Promise<{ battleId: string }>;
}) {
  const { battleId } = await params;
  return <ArenaResultClient battleId={battleId} />;
}
