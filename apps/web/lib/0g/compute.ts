// Server-only wrapper around the 0G Compute broker.
// Exposes a lazily-initialized broker + convenience inference/fine-tune helpers
// that a Next.js route handler can call.

import "server-only";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// Force the SDK through Node's CJS loader. The ESM bundle inlines its own
// `eciesjs` + `@noble/curves`; under bundled validation the ECIES public-key
// extraction in `decryptModel` rejects valid ciphertext with
// "second arg must be public key". The CJS build keeps both deps external,
// so the ECIES path matches the version we and the rest of the runtime use.
import type {
  createZGComputeNetworkBroker as CreateBrokerFn,
  ZGComputeNetworkBroker,
} from "@0gfoundation/0g-compute-ts-sdk";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createZGComputeNetworkBroker } = require("@0gfoundation/0g-compute-ts-sdk") as {
  createZGComputeNetworkBroker: typeof CreateBrokerFn;
};
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

  // 5. Download + acknowledge + decrypt.
  //
  // SDK exposes `acknowledgeModel` which does both the artifact download
  // and the on-chain acknowledgeDeliverable call. The on-chain ack is
  // required — without it the provider's `addDeliverable` validation
  // refuses subsequent tasks with `previous deliverable not acknowledged:
  // id=...`. The earlier wrapper used the legacy two-step path
  // (downloadModelFrom0GStorage → decryptModel) which skipped the ack
  // entirely, so successive runs blocked on each other.
  //
  // `downloadMethod: 'auto'` falls back to direct TEE download when the
  // 0G Storage path fails — relevant on dev machines where the SDK's
  // bundled `0g-storage-client` binary is the wrong arch (it ships only
  // a Linux x86_64 ELF; macOS / arm64 hits ENOEXEC). The patches/...
  // pnpm patch fixes the orthogonal off-by-one __dirname path bug so
  // the binary IS reachable on Linux x86_64 (i.e. Vercel functions).
  //
  // The fs.writeFile monkey-patch normalizes ArrayBuffer → Uint8Array so
  // axios response bodies (Node 20+) don't crash inside the SDK's
  // download path.
  const stamp = Date.now().toString(36);
  const artifactDir = path.join(os.tmpdir(), `yap-ft-${stamp}`);
  const decryptedPath = path.join(os.tmpdir(), `yap-ft-${stamp}.bin`);
  await fs.promises.mkdir(artifactDir, { recursive: true });

  const originalWriteFile = fs.promises.writeFile;
  const patchedWriteFile: typeof fs.promises.writeFile = async (
    file,
    data,
    options,
  ) => {
    let normalized = data;
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
    // Combined download + on-chain acknowledgeDeliverable. Auto mode tries
    // 0G Storage first, falls back to TEE direct HTTP on failure.
    await ft.acknowledgeModel(providerAddress, taskId, artifactDir, {
      downloadMethod: "auto",
    });

    // The artifact lives in artifactDir — pick the model file the SDK
    // dropped there. Path varies by download method (model_<taskId>.bin
    // for 0G Storage, lora_model_<taskId>.zip / .data for TEE).
    const items = await fs.promises.readdir(artifactDir);
    const candidate =
      items.find((f) => f.startsWith("model_")) ??
      items.find((f) => f.startsWith("lora_model_")) ??
      items.find((f) => f.endsWith(".data") || f.endsWith(".zip")) ??
      items[0];
    if (!candidate) {
      throw new Error(`acknowledgeModel produced no artifact in ${artifactDir}`);
    }
    const encryptedPath = path.join(artifactDir, candidate);

    // SDK's decryptModel internally calls `eciesjs.decrypt` and the
    // `@noble/curves` build that comes with the SDK rejects valid
    // ciphertext under Next.js bundling ("second arg must be public key").
    // Replicate the decrypt locally with the eciesjs the app declared as
    // a direct dep — same algorithm, but resolves to the unbundled libs.
    await decryptModelLocal(
      ft,
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
    await fs.promises.rm(artifactDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.unlink(decryptedPath).catch(() => {});
  }
}

// ────────────────────────── Custom decryption ──────────────────────────
// Reimplements broker.fineTuning.decryptModel using the local `eciesjs`
// + node:crypto. The SDK's bundled crypto stack misbehaves under Next.js
// (see comment near `decryptModelLocal` invocation above); the format is
// otherwise identical:
//   1. Read ECIES-encrypted AES key from on-chain `Deliverable.encryptedSecret`
//      and decrypt with the broker wallet's private key.
//   2. Encrypted artifact layout (per chunk):
//      [ 65-byte secp256k1 sig | 12-byte iv | (chunk: ciphertext + 16-byte tag)+ ]
//      — iv is incremented big-endian per chunk; tag covers the ciphertext;
//      the leading sig is over keccak(concat(tags)) so we can also recover
//      the TEE signer address as a sanity check.
//   3. Decrypt each 64MiB+16 chunk with AES-256-GCM and stream to disk.
async function decryptModelLocal(
  ft: NonNullable<ZGComputeNetworkBroker["fineTuning"]>,
  providerAddress: string,
  taskId: string,
  encryptedPath: string,
  decryptedPath: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const eciesjs = require("eciesjs") as {
    PrivateKey: { fromHex(hex: string): { secret: Uint8Array } };
    decrypt(privKey: Uint8Array, data: Buffer): Buffer;
  };
  const crypto = await import("node:crypto");
  const { ethers } = await import("ethers");

  // Reach into the SDK to grab the contract handle + signer (the SDK's
  // broker has these as `modelProcessor.contract`; types not exported).
  const ftAny = ft as unknown as {
    modelProcessor: {
      contract: {
        signer: { privateKey: string };
        getDeliverable(provider: string, id: string): Promise<{
          acknowledged: boolean;
          encryptedSecret: string;
        }>;
        getService(provider: string): Promise<{
          providerSigner?: string;
          teeSignerAddress?: string;
        }>;
      };
    };
  };
  const service = await ftAny.modelProcessor.contract.getService(providerAddress);

  // Provider populates `encryptedSecret` on-chain in a separate tx that
  // can lag the user's ack by tens of seconds. Poll the deliverable until
  // it shows up (cap at ~3 min so we surface a real failure on stalls).
  let deliverable = await ftAny.modelProcessor.contract.getDeliverable(
    providerAddress,
    taskId,
  );
  const deadline = Date.now() + 3 * 60_000;
  while (
    Date.now() < deadline &&
    (!deliverable.encryptedSecret || deliverable.encryptedSecret === "0x")
  ) {
    await new Promise((r) => setTimeout(r, 5000));
    deliverable = await ftAny.modelProcessor.contract.getDeliverable(
      providerAddress,
      taskId,
    );
  }
  if (!deliverable.acknowledged) {
    throw new Error(`Deliverable for task ${taskId} is not acknowledged`);
  }
  if (!deliverable.encryptedSecret || deliverable.encryptedSecret === "0x") {
    throw new Error(
      "Deliverable.encryptedSecret is empty after 3 min — provider may not have published the session key",
    );
  }

  // 1. ECIES decrypt to recover the AES-GCM key (32 bytes hex).
  const encHex = deliverable.encryptedSecret.startsWith("0x")
    ? deliverable.encryptedSecret.slice(2)
    : deliverable.encryptedSecret;
  const privKey = eciesjs.PrivateKey.fromHex(
    ftAny.modelProcessor.contract.signer.privateKey,
  );
  const aesKey = eciesjs.decrypt(privKey.secret, Buffer.from(encHex, "hex"));

  // 2. Stream the encrypted file in chunks, decrypting with AES-256-GCM.
  const SIG_LEN = 65;
  const IV_LEN = 12;
  const TAG_LEN = 16;
  const CHUNK_DATA_LEN = 64 * 1024 * 1024; // 64 MiB plaintext per chunk
  const CHUNK_LEN = CHUNK_DATA_LEN + TAG_LEN;

  const fd = await fs.promises.open(encryptedPath, "r");
  const writeFd = await fs.promises.open(decryptedPath, "w");
  try {
    const sigBuf = Buffer.alloc(SIG_LEN);
    const ivBuf = Buffer.alloc(IV_LEN);
    let offset = 0;
    let r = await fd.read(sigBuf, 0, SIG_LEN, offset);
    offset += r.bytesRead;
    r = await fd.read(ivBuf, 0, IV_LEN, offset);
    offset += r.bytesRead;

    const chunkBuf = Buffer.alloc(CHUNK_LEN);
    const tagsParts: Buffer[] = [];
    while (true) {
      r = await fd.read(chunkBuf, 0, CHUNK_LEN, offset);
      const n = r.bytesRead;
      if (n === 0) break;
      const ciphertext = chunkBuf.subarray(0, n - TAG_LEN);
      const tag = chunkBuf.subarray(n - TAG_LEN, n);
      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, ivBuf);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      await writeFd.write(plain);
      tagsParts.push(Buffer.from(tag));
      offset += n;
      // Increment IV big-endian, like the SDK.
      for (let i = ivBuf.length - 1; i >= 0; i--) {
        ivBuf[i] = (ivBuf[i] + 1) & 0xff;
        if (ivBuf[i] !== 0) break;
      }
    }

    // 3. Sanity-check TEE signer (best-effort; mismatch logged, not fatal).
    const tagsAll = Buffer.concat(tagsParts);
    const recovered = ethers.recoverAddress(
      ethers.keccak256(tagsAll),
      "0x" + sigBuf.toString("hex"),
    );
    const expected = service.teeSignerAddress ?? service.providerSigner;
    if (expected && recovered.toLowerCase() !== expected.toLowerCase()) {
      console.warn(
        `[compute] TEE signer mismatch — recovered=${recovered} expected=${expected}`,
      );
    }
  } finally {
    await fd.close();
    await writeFd.close();
  }
}
