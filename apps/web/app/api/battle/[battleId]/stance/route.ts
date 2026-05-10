import { NextResponse } from "next/server";
import { saveBattleStance, getBattleStance } from "@/lib/battle-stance";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ battleId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { battleId: raw } = await params;
  const battleId = Number(raw);
  if (!Number.isFinite(battleId) || battleId <= 0)
    return NextResponse.json({ error: "invalid battleId" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { side?: string };
  if (body.side !== "pro" && body.side !== "con")
    return NextResponse.json({ error: "side must be 'pro' or 'con'" }, { status: 400 });

  await saveBattleStance(battleId, body.side);
  return NextResponse.json({ battleId, challengerSide: body.side });
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { battleId: raw } = await params;
  const battleId = Number(raw);
  if (!Number.isFinite(battleId) || battleId <= 0)
    return NextResponse.json({ error: "invalid battleId" }, { status: 400 });

  const side = await getBattleStance(battleId);
  return NextResponse.json({ battleId, challengerSide: side });
}
