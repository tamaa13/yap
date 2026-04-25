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
//
// Rate-limited: starting a new battle triggers paid 0G Compute inference,
// so unrestricted POSTing would let an attacker drain the broker ledger.
// Two layers:
//   - per-IP: 10 starts/min (caps naive curl loops)
//   - per-battleId: 1 start/30s (de-dupes legitimate concurrent triggers
//     from challenger + defender + first spectator)

import { NextResponse } from "next/server";
import { startBattleRunner } from "@/lib/battle-state/runner";
import { consume, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Battle runner scheduled via after() can run up to maxDuration seconds.
// Vercel Pro/Fluid Compute caps at 800–900s; multi-round battle of 5
// rounds × ~60s/round + judging fits inside that envelope. Hobby tier
// (60s) is too low — deploy to Pro or use Fluid Compute.
export const maxDuration = 800;

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

  const ip = clientIp(req);
  if (!consume("start", `ip:${ip}`, { tokens: 10, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: "rate limited — try again shortly" },
      { status: 429 },
    );
  }
  if (!consume("start", `battle:${battleId}`, { tokens: 1, windowMs: 30_000 })) {
    return NextResponse.json(
      { error: "battle already starting — subscribe to /stream" },
      { status: 429 },
    );
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
