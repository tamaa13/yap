// POST /api/battle/[battleId]/round-input
//
// Register the owning user's stance pick (ATTACK / BUILD) for a specific
// fighter side + round. The pick is read by `lib/battle-state/runner.ts`
// just before the corresponding streamRound fires, augmenting the user
// prompt with a stance instruction. If no pick arrives within the
// runner's 5s wait window, prompt-build falls through to the default
// "build" stance.
//
// Owner gating lives on the client (iControl semantics, mirrors the
// arena-pending accept gate). The server treats the choice as anonymous
// input — same trust model as `/react`. A motivated attacker can only
// nudge their opponent's next-turn stance toward "build" or "attack",
// which is a UX nudge, not a verdict lever.

import { NextResponse } from "next/server";
import { getBattleStore } from "@/lib/battle-state/store";
import {
  ROUND_CHOICES,
  type RoundChoice,
} from "@/lib/battle-state/types";

export const runtime = "nodejs";

interface Body {
  round?: number;
  side?: "a" | "b";
  choice?: string;
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
  if (
    typeof body.round !== "number" ||
    !Number.isInteger(body.round) ||
    body.round < 1
  ) {
    return NextResponse.json(
      { error: "round must be a positive integer" },
      { status: 400 },
    );
  }
  if (body.side !== "a" && body.side !== "b") {
    return NextResponse.json(
      { error: "side must be 'a' or 'b'" },
      { status: 400 },
    );
  }
  const choice = body.choice as RoundChoice | undefined;
  if (!choice || !ROUND_CHOICES.includes(choice)) {
    return NextResponse.json(
      { error: `choice must be one of: ${ROUND_CHOICES.join(", ")}` },
      { status: 400 },
    );
  }

  const store = getBattleStore();
  const current = await store.get(battleId);
  if (!current) {
    return NextResponse.json(
      { error: "battle state not found — start battle first" },
      { status: 404 },
    );
  }
  // Reject inputs for rounds the runner has already passed — late picks
  // can't retro-affect a settled argument. Equal-round is allowed because
  // the runner blocks for `roundInputWindowMs` after entering _thinking.
  if (body.round < current.currentRound) {
    return NextResponse.json(
      { error: "round already past" },
      { status: 409 },
    );
  }

  await store.update(battleId, (prev) => {
    const existing = prev.roundInputs ?? {};
    const forRound = existing[body.round!] ?? {};
    return {
      ...prev,
      roundInputs: {
        ...existing,
        [body.round!]: { ...forRound, [body.side!]: choice },
      },
    };
  });

  store.publish(battleId, {
    type: "round-input",
    round: body.round,
    side: body.side,
    choice,
  });

  return NextResponse.json({ round: body.round, side: body.side, choice });
}
