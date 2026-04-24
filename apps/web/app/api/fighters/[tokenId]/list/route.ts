import { NextResponse } from "next/server";
import { getFighterMeta, updateFighterMeta } from "@/lib/fighter-meta";

export const runtime = "nodejs";

interface ListBody {
  action: "list" | "unlist";
  price?: number;
  requester?: string; // wallet address attempting the action
}

/**
 * POST /api/fighters/[tokenId]/list
 *
 * Toggles an off-chain listing flag for a fighter. No marketplace contract
 * exists yet — this is a server-side mock that mirrors where real listing
 * state will live once the escrow contract lands in Phase B.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await ctx.params;
  const id = Number(tokenId);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "invalid tokenId" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as ListBody;

  const meta = await getFighterMeta(id);
  if (!meta) {
    return NextResponse.json({ error: "fighter not found" }, { status: 404 });
  }
  if (
    body.requester &&
    body.requester.toLowerCase() !== meta.owner.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "only owner can list/unlist" },
      { status: 403 },
    );
  }

  if (body.action === "list") {
    const price = Number(body.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "valid price required" }, { status: 400 });
    }
    const updated = await updateFighterMeta(id, {
      forSale: true,
      price,
      listedAt: Date.now(),
    });
    return NextResponse.json(updated);
  }

  if (body.action === "unlist") {
    const updated = await updateFighterMeta(id, {
      forSale: false,
      price: undefined,
      listedAt: undefined,
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
