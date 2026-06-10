// GET /api/cron/settle-battles
//
// Backstop sweeper: settles every battle in the pending-settle set whose
// dispute window has elapsed. The state route already settles lazily when a
// result page is viewed; this catches battles nobody re-opened. Wired as a
// Vercel cron in vercel.json. On Hobby crons run ~daily; on Pro set a tighter
// schedule. Settlement is permissionless on-chain post-window, so a missed
// cron only delays payout, never loses funds.

import { NextResponse } from "next/server";
import { sweepPendingSettles } from "@/lib/battle-state/settle";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  // If CRON_SECRET is configured, require it (Vercel cron sends it as a
  // Bearer token). Without it set, allow — settle() is idempotent + safe.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const results = await sweepPendingSettles();
  const settled = results.filter((r) => r.settled).length;
  return NextResponse.json({ swept: results.length, settled, results });
}
