// GET /api/battle/[battleId]/kv-snapshot
//
// Returns the latest public-safe snapshot recorded for this battle on
// 0G KV. Useful for spectator replay, verification screenshots, and the
// "view durable record" link on the result page. The in-memory store +
// Redis bus remain authoritative for live state; this endpoint is a
// snapshot of what's been committed to 0G's own KV layer.
//
// Returns:
//   - 200 { snapshot } when KV holds a record (snapshot may be partial
//     mid-battle — last write was after the most recent round_complete).
//   - 200 { snapshot: null, kvEnabled: false } when KV is disabled in
//     this deployment.
//   - 200 { snapshot: null, kvEnabled: true } when KV is enabled but
//     no record exists yet (battle hasn't crossed its first round
//     boundary, or KV writes have been failing — check server logs).

import { NextResponse } from "next/server";
import { kvEnabled, readBattleSnapshot } from "@/lib/0g/kv";

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
  const enabled = kvEnabled();
  if (!enabled) {
    return NextResponse.json({ snapshot: null, kvEnabled: false });
  }
  const snapshot = await readBattleSnapshot(battleId);
  return NextResponse.json({ snapshot, kvEnabled: true });
}
