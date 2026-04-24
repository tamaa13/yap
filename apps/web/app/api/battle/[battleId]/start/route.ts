// POST /api/battle/[battleId]/start
//
// Kicks off the battle runner for the given battleId. Idempotent:
//   - Already-settled battle → returns final state
//   - In-flight battle → returns current snapshot; caller should subscribe
//     to /stream for updates
//   - Failed battle → re-runs if body.restart===true, else returns failure
//
// Anyone can trigger a run (the defender accepting the challenge, the
// challenger, a spectator who wants to watch). Once started, all viewers
// share the same state via SSE.

import { NextResponse } from "next/server";
import { startBattleRunner } from "@/lib/battle-state/runner";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  restart?: boolean;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ battleId: string }> },
) {
  const { battleId: raw } = await params;
  const battleId = Number(raw);
  if (!Number.isFinite(battleId) || battleId <= 0) {
    return NextResponse.json({ error: "invalid battleId" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;

  try {
    const state = await startBattleRunner({ battleId, restart: body.restart });
    return NextResponse.json(state);
  } catch (e) {
    const message = e instanceof Error ? e.message : "start failed";
    console.error("[api/battle/start]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
