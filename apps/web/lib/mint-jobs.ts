// In-memory job tracker for the async mint flow.
//
// Phase 2 pivot: fine-tune dropped from the pipeline. The pipeline now
// runs in ~5 s (upload seed → encrypt seed → upload encrypted), but the
// async pattern is preserved so the existing UI keeps polling without
// a special-case sync path. After Vercel migration the work runs in
// `after()`; this in-memory map is fine for single-process dev. Jobs
// are GC'd after 1 hour.

import "server-only";

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

const jobs = new Map<string, MintJob>();

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

export function createMintJob(): MintJob {
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
  jobs.set(id, job);
  for (const [k, v] of jobs) {
    if (now - v.startedAt > 60 * 60_000) jobs.delete(k);
  }
  return job;
}

export function getMintJob(id: string): MintJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  return { ...job, elapsedMs: Date.now() - job.startedAt };
}

export function setMintJobStatus(id: string, status: MintJobStatus): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = status;
  job.step = STEP_LABEL[status];
  job.progress = PHASE_PROGRESS[status];
  job.updatedAt = Date.now();
}

export function setMintJobResult(id: string, result: MintJobResult): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "ready";
  job.step = STEP_LABEL.ready;
  job.progress = 1;
  job.result = result;
  job.updatedAt = Date.now();
}

export function setMintJobError(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "failed";
  job.step = STEP_LABEL.failed;
  job.progress = 1;
  job.error = error;
  job.updatedAt = Date.now();
}
