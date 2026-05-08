import { NextResponse } from "next/server";
import { createMintJob } from "@/lib/mint-jobs";
import { runMintPipeline } from "@/lib/mint-pipeline";
import { FIGHTER_INFT_ADDRESS } from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 30;

interface StartBody {
  owner?: `0x${string}`;
  name?: string;
  archetype?: string;
  avatar?: number;
  styleSeed?: string;
}

/**
 * POST /api/mint/start
 *
 * Validates input, creates an in-memory mint job, fires the pipeline as
 * fire-and-forget, returns the jobId immediately. Client polls
 * /api/mint/status/<id> for progress + final result.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as StartBody;
  const owner = body.owner;
  const seed = body.styleSeed?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const archetype = body.archetype?.trim() ?? "";
  const avatar = typeof body.avatar === "number" ? body.avatar : 0;

  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    return NextResponse.json(
      { error: "valid owner address required" },
      { status: 400 },
    );
  }
  if (!seed) return NextResponse.json({ error: "styleSeed required" }, { status: 400 });
  if (!archetype) return NextResponse.json({ error: "archetype required" }, { status: 400 });
  if (FIGHTER_INFT_ADDRESS === "") {
    return NextResponse.json(
      { error: "YapFighter address not configured" },
      { status: 503 },
    );
  }

  const job = createMintJob();

  // Fire-and-forget. Errors are captured into the job state by
  // runMintPipeline itself, so a logged warning is the most we want
  // here — the client will see status: "failed" via /status polling.
  runMintPipeline(
    { owner, name, archetype, avatar, seed },
    job.id,
  ).catch((e) => {
    console.warn(`[api/mint/start] job ${job.id} failed (already in state):`, e);
  });

  return NextResponse.json({ jobId: job.id });
}
