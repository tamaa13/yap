// Job tracker for the async mint flow.
//
// Phase 2 pivot: fine-tune dropped from the pipeline. The pipeline now
// runs in ~5 s (upload seed → encrypt seed → upload encrypted), but the
// async pattern is preserved so the existing UI keeps polling without
// a special-case sync path.
//
// Storage: on Vercel the /mint/start and /mint/status requests land in
// DIFFERENT serverless instances, so a module-level Map loses the job
// between create and poll → "job not found". When KV/Upstash Redis is
// configured (KV_REST_API_URL / UPSTASH_REDIS_REST_URL) jobs persist
// there with a 1h TTL, shared across instances. Falls back to an
// in-process Map for local `next dev` (no Redis required).

import "server-only";
import { Redis } from "@upstash/redis";

export type MintJobStatus =
  | "queued"
  | "uploading-seed"
  | "encrypting"
  | "uploading-encrypted"
  | "ready"
  | "failed";

export interface MintJobResult {
  mint: {
    to: `0x${string}`;
    encryptedURI: string;
    metadataHash: `0x${string}`;
    sealedKey: string;
  };
  commit: {
    owner: `0x${string}`;
    name: string;
    archetype: string;
    avatar: number;
    seedRoot: string;
    weightsRoot: string;
    signatureStyle: string[];
  };
  steps: {
    seedRoot: string;
    weightsRoot: string;
  };
}

export interface MintJob {
  id: string;
  status: MintJobStatus;
  /** 0-1 best-effort progress, advanced based on phase. */
  progress: number;
  /** Human-friendly current step label (shown to user). */
  step: string;
  /** Wall-clock ms since job creation, useful for live ETAs. */
  elapsedMs: number;
  startedAt: number;
  updatedAt: number;
  result?: MintJobResult;
  error?: string;
}

// --- Storage layer: shared Redis (prod) or in-process Map (local dev) ---

const JOB_TTL_SECONDS = 60 * 60; // 1h — matches the old in-memory GC window
const jobKey = (id: string) => `mintjob:${id}`;

function makeRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = makeRedis();
const mem = new Map<string, MintJob>();

async function readJob(id: string): Promise<MintJob | null> {
  if (redis) return (await redis.get<MintJob>(jobKey(id))) ?? null;
  return mem.get(id) ?? null;
}

async function writeJob(job: MintJob): Promise<void> {
  if (redis) {
    await redis.set(jobKey(job.id), job, { ex: JOB_TTL_SECONDS });
    return;
  }
  mem.set(job.id, job);
  const now = Date.now();
  for (const [k, v] of mem) {
    if (now - v.startedAt > JOB_TTL_SECONDS * 1000) mem.delete(k);
  }
}

const PHASE_PROGRESS: Record<MintJobStatus, number> = {
  queued: 0.05,
  "uploading-seed": 0.3,
  encrypting: 0.55,
  "uploading-encrypted": 0.85,
  ready: 1,
  failed: 1,
};

const STEP_LABEL: Record<MintJobStatus, string> = {
  queued: "Queued",
  "uploading-seed": "Uploading style seed to 0G Storage",
  encrypting: "Sealing your fighter with a fresh AES key",
  "uploading-encrypted": "Publishing INFT payload to 0G Storage",
  ready: "Ready to sign on-chain",
  failed: "Failed",
};

function rid(): string {
  // Short job id — collision risk negligible for in-process map.
  return Math.random().toString(36).slice(2, 12);
}

export async function createMintJob(): Promise<MintJob> {
  const id = rid();
  const now = Date.now();
  const job: MintJob = {
    id,
    status: "queued",
    progress: PHASE_PROGRESS.queued,
    step: STEP_LABEL.queued,
    elapsedMs: 0,
    startedAt: now,
    updatedAt: now,
  };
  await writeJob(job);
  return job;
}

export async function getMintJob(id: string): Promise<MintJob | null> {
  const job = await readJob(id);
  if (!job) return null;
  return { ...job, elapsedMs: Date.now() - job.startedAt };
}

export async function setMintJobStatus(
  id: string,
  status: MintJobStatus,
): Promise<void> {
  const job = await readJob(id);
  if (!job) return;
  job.status = status;
  job.step = STEP_LABEL[status];
  job.progress = PHASE_PROGRESS[status];
  job.updatedAt = Date.now();
  await writeJob(job);
}

export async function setMintJobResult(
  id: string,
  result: MintJobResult,
): Promise<void> {
  const job = await readJob(id);
  if (!job) return;
  job.status = "ready";
  job.step = STEP_LABEL.ready;
  job.progress = 1;
  job.result = result;
  job.updatedAt = Date.now();
  await writeJob(job);
}

export async function setMintJobError(
  id: string,
  error: string,
): Promise<void> {
  const job = await readJob(id);
  if (!job) return;
  job.status = "failed";
  job.step = STEP_LABEL.failed;
  job.progress = 1;
  job.error = error;
  job.updatedAt = Date.now();
  await writeJob(job);
}
