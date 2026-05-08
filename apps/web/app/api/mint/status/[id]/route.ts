import { NextResponse } from "next/server";
import { getMintJob } from "@/lib/mint-jobs";

export const runtime = "nodejs";
export const maxDuration = 10;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/mint/status/<id>
 *
 * Returns the current state of a mint job. Client polls this every few
 * seconds. The shape is stable across all phases — `result` is only
 * populated once `status === "ready"`, `error` only when
 * `status === "failed"`.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const job = getMintJob(id);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}
