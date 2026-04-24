import { FighterDetailClient } from "./fighter-detail-client";

export default async function FighterPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;
  return <FighterDetailClient tokenId={Number(tokenId)} />;
}
