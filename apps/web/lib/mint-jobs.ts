// In-memory job tracker for the async mint flow.
//
// Yap's mint pipeline takes ~9 minutes (real fine-tune + decrypt + upload),
// well past any practical HTTP timeout. Instead of blocking the request,
// `/api/mint/start` enqueues a job, fires the work as fire-and-forget
// against this singleton, and returns a jobId in <2 s. The client polls
// `/api/mint/status/<id>` for progress.
//
// Single-process scope: pm2 runs one yap-web instance, so an in-memory
// Map suffices. If the process restarts mid-job, the job is lost — fine
// for the hackathon demo (don't restart during a mint). Production should
// migrate to Redis-backed BullMQ.

import "server-only";

export type MintJobStatus =
  | "queued"
  | "uploading-seed"
  | "training"
  | "decrypting"
  | "encrypting-weights"
  | "uploading-weights"
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
    fineTuneBypassed: boolean;
  };
  steps: {
    seedRoot: string;
    fineTuneTaskId: string | null;
    fineTuneProvider: string | null;
    fineTuneBypassed: boolean;
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

// Each phase's expected progress at completion. Used to advance the
// progress bar smoothly during the long fine-tune phase rather than
// jumping in big steps.
const PHASE_PROGRESS: Record<MintJobStatus, number> = {
  queued: 0.02,
  "uploading-seed": 0.05,
  training: 0.65,
  decrypting: 0.75,
  "encrypting-weights": 0.78,
  "uploading-weights": 0.97,
  ready: 1,
  failed: 1,
};

const STEP_LABEL: Record<MintJobStatus, string> = {
  queued: "Queued",
  "uploading-seed": "Uploading style seed to 0G Storage",
  training: "Training your fighter on TEE GPU (the long part)",
  decrypting: "Verifying TEE attestation and decrypting weights",
  "encrypting-weights": "Sealing weights with a fresh AES key",
  "uploading-weights": "Publishing encrypted INFT to 0G Storage",
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
  // GC: drop jobs older than 1 hour to bound memory.
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
