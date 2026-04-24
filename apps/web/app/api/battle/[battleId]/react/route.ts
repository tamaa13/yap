// POST /api/battle/[battleId]/react
//
// Register a viewer reaction. Anonymous (no wallet auth) for zero-friction
// interaction during live battles — reactions have no economic impact so
// the spam surface is low. Payload: { key: ReactionKey }.
//
// Increment is atomic via the store's update() helper. Publishes a
// `reaction` SSE event so every connected spectator sees the bump live.

import { NextResponse } from "next/server";
import { getBattleStore } from "@/lib/battle-state/store";
import { REACTION_KEYS, type ReactionKey } from "@/lib/battle-state/types";

export const runtime = "nodejs";

interface Body {
  key?: string;
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
  const key = body.key as ReactionKey | undefined;
  if (!key || !REACTION_KEYS.includes(key)) {
    return NextResponse.json(
      { error: `key must be one of: ${REACTION_KEYS.join(", ")}` },
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

  const next = await store.update(battleId, (prev) => ({
    ...prev,
    reactions: {
      ...prev.reactions,
      [key]: (prev.reactions?.[key] ?? 0) + 1,
    },
  }));

  // Publish minimal event so subscribers can update a single counter
  // without re-consuming the whole state snapshot.
  store.publish(battleId, {
    type: "reaction",
    key,
    count: next.reactions[key] ?? 0,
  });

  return NextResponse.json({
    key,
    count: next.reactions[key] ?? 0,
  });
}
