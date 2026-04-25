// Server-only wrapper around the 0G Compute broker.
// Exposes a lazily-initialized broker + convenience inference/fine-tune helpers
// that a Next.js route handler can call.

import "server-only";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  createZGComputeNetworkBroker,
  type ZGComputeNetworkBroker,
} from "@0glabs/0g-serving-broker";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { activeChain } from "@/lib/chains";

const RPC = activeChain.rpcUrls.default.http[0];

let cached: ZGComputeNetworkBroker | null = null;

export async function getBroker(): Promise<ZGComputeNetworkBroker> {
  if (cached) return cached;
  // Broker funds 0G Compute (inference + fine-tune) ledger and pays Storage
  // submission gas. Isolated from the verdict relayer key so a leak here only
  // exposes Compute spend, not on-chain verdict submission.
  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set");
  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(pk, provider);
  cached = await createZGComputeNetworkBroker(wallet);
  return cached;
}

export interface InferenceCall {
  providerAddress: string;
  model: string;
  prompt: string;
}

export interface InferenceResult {
  text: string;
  signatureValid: boolean;
  providerAddress: string;
  chatID?: string;
}

/**
 * Run a single chat completion against a 0G Compute provider. Uses
 * getRequestHeaders → fetch → processResponse to honor the TEE billing +
 * signature verification pipeline.
 */
export async function runInference(call: InferenceCall): Promise<InferenceResult> {
  const broker = await getBroker();
  await broker.inference.acknowledgeProviderSigner(call.providerAddress).catch(() => {});

  const headers = await broker.inference.getRequestHeaders(
    call.providerAddress,
    call.prompt,
  );

  // Provider endpoint URL is not exposed directly by the broker in all SDK
  // versions; many deployments embed it in the service metadata. Consumers
  // should pass an explicit base URL via env. For the hackathon flow we rely
  // on a well-known env var.
  const baseUrl = process.env.ZG_COMPUTE_PROVIDER_URL;
  if (!baseUrl) {
    throw new Error("ZG_COMPUTE_PROVIDER_URL not set (per-provider base URL)");
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers as unknown as Record<string, string>),
    },
    body: JSON.stringify({
      model: call.model,
      messages: [{ role: "user", content: call.prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`inference HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    id?: string;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const signatureValid =
    (await broker.inference.processResponse(call.providerAddress, data.id, text)) ??
    false;

  return {
    text,
    signatureValid,
    providerAddress: call.providerAddress,
    chatID: data.id,
  };
}

// ────────────────────────── Fine-tuning ──────────────────────────

export interface FineTuneConfig {
  neftune_noise_alpha: number;
  num_train_epochs: number;
  per_device_train_batch_size: number;
  learning_rate: number;
  max_steps: number;
}

export interface FineTuneCall {
  datasetHash: string;
  baseModel?: string;
  providerAddress?: string;
  config?: Partial<FineTuneConfig>;
}

export interface FineTuneResult {
  taskId: string;
  providerAddress: string;
  preTrainedModelName: string;
  weightsBytes: Uint8Array;
  attestationSig?: string;
}

const DEFAULT_FINE_TUNE_CONFIG: FineTuneConfig = {
  neftune_noise_alpha: 5,
  num_train_epochs: 1,
  per_device_train_batch_size: 2,
  learning_rate: 0.0002,
  max_steps: 3,
};

// Task.progress strings observed in the 0G SDK; anything else means still in
// flight. Matching is case-insensitive.
const DONE_STATES = new Set(["finished", "done", "delivered"]);
const FAIL_STATES = new Set(["failed", "cancelled", "canceled", "error"]);

/**
 * End-to-end fine-tune:
 *  1. list providers + pick one that serves the requested base model
 *  2. top up ledger + transfer to provider sub-account (best-effort)
 *  3. materialize training params to a temp JSON file + submit task
 *  4. poll getTask until terminal state
 *  5. download + decrypt the artifact, return raw bytes
 *
 * Errors bubble up; caller should fall back to seed-as-weights when
 * ZG_FINE_TUNE_BYPASS=true.
 */
export async function fineTune(call: FineTuneCall): Promise<FineTuneResult> {
  const broker = await getBroker();
  // `fineTuning` is typed optional because the broker can be built without a
  // fine-tune contract address on some networks. On 0G Galileo/Aristotle it's
  // always populated; narrow up front with a clear error message.
  const ft = broker.fineTuning;
  if (!ft) {
    throw new Error(
      "0G Compute broker has no fine-tuning service on this network; set ZG_FINE_TUNE_BYPASS=true to skip",
    );
  }
  const baseModel = call.baseModel ?? process.env.ZG_FIGHTER_MODEL ?? "qwen3.6-plus";

  // 1. Pick provider.
  let providerAddress = call.providerAddress;
  if (!providerAddress) {
    const services = await ft.listService();
    const match = services.find(
      (s) => !s.occupied && (s.models?.includes(baseModel) ?? true),
    );
    const fallback = services[0];
    const chosen = match ?? fallback;
    if (!chosen) throw new Error("no fine-tune providers available on 0G Compute");
    providerAddress = chosen.provider;
  }

  // 2. Best-effort ledger funding. Any of these can throw "already funded" /
  // "insufficient allowance" on repeat runs — swallow + continue; real errors
  // surface at createTask.
  await ft.acknowledgeProviderSigner(providerAddress).catch(() => {});
  await broker.ledger.depositFund(3).catch(() => {});
  await broker.ledger
    .transferFund(providerAddress, "fine-tuning", parseEther("1"))
    .catch(() => {});

  // 3. Write training params + submit.
  const params: FineTuneConfig = { ...DEFAULT_FINE_TUNE_CONFIG, ...call.config };
  const paramsPath = path.join(
    os.tmpdir(),
    `yap-ft-params-${Date.now().toString(36)}.json`,
  );
  await fs.promises.writeFile(paramsPath, JSON.stringify(params));

  let taskId: string;
  try {
    try {
      taskId = await ft.createTask(
        providerAddress,
        baseModel,
        call.datasetHash,
        paramsPath,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Provider rejects new tasks while a prior task is still "unfinished"
      // (Delivered but not yet acknowledged by the user). Recover by picking
      // up the most recent existing task and continuing the pipeline with it.
      if (/unfinished task/i.test(msg)) {
        const existing = await ft.listTask(providerAddress);
        const mine = existing
          .filter((t) => t.id)
          .sort((a, b) => {
            const at = new Date(a.createdAt ?? 0).getTime();
            const bt = new Date(b.createdAt ?? 0).getTime();
            return bt - at;
          });
        const pick = mine[0];
        if (!pick?.id) throw e;
        taskId = pick.id;
      } else {
        throw e;
      }
    }
  } finally {
    await fs.promises.unlink(paramsPath).catch(() => {});
  }

  // 4. Poll.
  const maxWaitMs = Number(process.env.ZG_FINE_TUNE_TIMEOUT_MS ?? 10 * 60 * 1000);
  const pollMs = Number(process.env.ZG_FINE_TUNE_POLL_MS ?? 10_000);
  const deadline = Date.now() + maxWaitMs;
  let attestationSig: string | undefined;

  while (Date.now() < deadline) {
    const task = await ft.getTask(providerAddress, taskId);
    const progress = (task.progress ?? "").toLowerCase().trim();
    if (DONE_STATES.has(progress)) {
      attestationSig = task.signature || undefined;
      break;
    }
    if (FAIL_STATES.has(progress)) {
      throw new Error(`fine-tune task ${taskId} ${task.progress}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  if (Date.now() >= deadline) {
    throw new Error(
      `fine-tune task ${taskId} timed out after ${maxWaitMs}ms on provider ${providerAddress}`,
    );
  }

  // 5. Download + decrypt. SDK exposes two paths:
  //    (a) acknowledgeModel — single call, both downloads + acknowledges,
  //        but under Node 20+ hits an ArrayBuffer/Buffer incompat from
  //        axios response body piped to fs.writeFile.
  //    (b) downloadModelFrom0GStorage + decryptModel — legacy two-step
  //        that uses the same underlying pipe, same bug.
  //
  // To work around, we install a one-shot monkey-patch on fs.writeFile
  // that normalizes ArrayBuffer → Buffer before delegating. Scoped to
  // this function call so it doesn't leak globally.
  const stamp = Date.now().toString(36);
  const encryptedPath = path.join(os.tmpdir(), `yap-ft-${stamp}.enc`);
  const decryptedPath = path.join(os.tmpdir(), `yap-ft-${stamp}.bin`);

  const originalWriteFile = fs.promises.writeFile;
  const patchedWriteFile: typeof fs.promises.writeFile = async (
    file,
    data,
    options,
  ) => {
    let normalized = data;
    // Node fs.writeFile rejects raw ArrayBuffer; wrap into Uint8Array view.
    if (data instanceof ArrayBuffer) {
      normalized = new Uint8Array(data);
    }
    return originalWriteFile(
      file as Parameters<typeof originalWriteFile>[0],
      normalized as Parameters<typeof originalWriteFile>[1],
      options as Parameters<typeof originalWriteFile>[2],
    );
  };
  (fs.promises as unknown as { writeFile: typeof patchedWriteFile }).writeFile =
    patchedWriteFile;

  try {
    await ft.downloadModelFrom0GStorage(
      providerAddress,
      taskId,
      encryptedPath,
    );
    await ft.decryptModel(
      providerAddress,
      taskId,
      encryptedPath,
      decryptedPath,
    );
    const weightsBytes = new Uint8Array(
      await fs.promises.readFile(decryptedPath),
    );
    return {
      taskId,
      providerAddress,
      preTrainedModelName: baseModel,
      weightsBytes,
      attestationSig,
    };
  } finally {
    (fs.promises as unknown as { writeFile: typeof originalWriteFile }).writeFile =
      originalWriteFile;
    await fs.promises.unlink(encryptedPath).catch(() => {});
    await fs.promises.unlink(decryptedPath).catch(() => {});
  }
}
