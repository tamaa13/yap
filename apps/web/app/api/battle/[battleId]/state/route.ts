// GET /api/battle/[battleId]/state
// Returns the current BattleState snapshot, or null if no run has started.
// Also reports the current spectator count (live SSE subscribers).

import { NextResponse, after } from "next/server";
import { getBattleStore } from "@/lib/battle-state/store";
import { settleIfReady } from "@/lib/battle-state/settle";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ battleId: string }> },
) {
  const { battleId: raw } = await params;
  const battleId = Number(raw);
  if (!Number.isFinite(battleId) || battleId <= 0) {
    return NextResponse.json({ error: "invalid battleId" }, { status: 400 });
  }
  const store = getBattleStore();
  const [state, spectators] = await Promise.all([
    store.get(battleId),
    Promise.resolve(store.subscriberCount(battleId)),
  ]);
  // Lazy on-chain settlement: once the verdict is in (off-chain phase
  // "settled") and the dispute window has elapsed, finalize the pari-mutuel
  // pool on-chain. settleIfReady() no-ops cheaply until the window passes and
  // is idempotent after. Runs in after() so it never delays this response.
  if (state?.phase === "settled") {
    after(() => settleIfReady(battleId));
  }
  return NextResponse.json({ state, spectators });
}
