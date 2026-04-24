import { NextResponse } from "next/server";
import { runInference } from "@/lib/0g/compute";

export const runtime = "nodejs";

interface InferenceBody {
  battleId?: string;
  topic?: string;
  fighterName?: string;
  archetype?: string;
  round?: number;
  side?: "a" | "b";
  priorTranscript?: string;
}

/**
 * POST /api/battle/inference
 * Per-turn argument generation for a fighter. Calls 0G Compute with the
 * fighter's persona + prior round transcript and returns the next argument
 * along with the TEE signature verification result.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as InferenceBody;
  if (!body.battleId || !body.topic || !body.fighterName || !body.archetype) {
    return NextResponse.json(
      { error: "battleId, topic, fighterName, archetype are required" },
      { status: 400 },
    );
  }

  const providerAddress = process.env.ZG_COMPUTE_PROVIDER ?? process.env.TEE_ORACLE_ADDR;
  if (!providerAddress) {
    return NextResponse.json(
      { error: "ZG_COMPUTE_PROVIDER not configured" },
      { status: 503 },
    );
  }
  const model = process.env.ZG_FIGHTER_MODEL ?? "qwen3.6-plus";

  const prompt = [
    `You are ${body.fighterName}, a ${body.archetype} AI debate fighter.`,
    `Topic: ${body.topic}`,
    body.priorTranscript
      ? `Prior arguments:\n${body.priorTranscript}`
      : "No prior arguments yet.",
    `It's round ${body.round ?? 1}. Corner ${body.side === "b" ? "B" : "A"} speaks.`,
    "Respond with a single, in-character argument (2-3 sentences).",
  ].join("\n\n");

  try {
    const result = await runInference({ providerAddress, model, prompt });
    return NextResponse.json({
      battleId: body.battleId,
      round: body.round ?? 1,
      side: body.side ?? "a",
      text: result.text,
      signatureValid: result.signatureValid,
      providerAddress: result.providerAddress,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "inference failed";
    console.error("[api/battle/inference]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
