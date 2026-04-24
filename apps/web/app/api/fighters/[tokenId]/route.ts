import { NextResponse } from "next/server";
import { getFighterMeta } from "@/lib/fighter-meta";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await ctx.params;
  const id = Number(tokenId);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "invalid tokenId" }, { status: 400 });
  }
  const meta = await getFighterMeta(id);
  if (!meta) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(meta);
}
