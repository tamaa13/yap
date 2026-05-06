// Fine-tune deep-debug spike v2.
//
// Differences vs v1:
//   1. Uses uploadBuffer (the same path /api/mint takes) instead of
//      ZgFile.fromFilePath via Indexer.upload — eliminates dataset
//      format / hashing variance as a possible cause of the historical
//      "Delivering → Failed" transition.
//   2. Larger dataset — 12 JSONL lines instead of 3, in case the previous
//      provider rejected the seed for being below a training-floor size.
//   3. On task failure, calls broker.fineTuning.getLog(provider, taskId)
//      to surface the provider-side error log so we can see WHY the
//      Failed status appeared.
//   4. Polls progress every 8s instead of 10s to catch state transitions
//      with finer resolution.
//   5. Final downloadModelFrom0GStorage attempt walks both the success
//      path and the historical SDK bug paths (ArrayBuffer fs.writeFile,
//      __dirname-relative spawn) so we can isolate exactly which one
//      breaks.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet, parseEther, keccak256 } from "ethers";
import {
  createZGComputeNetworkBroker,
  type ZGComputeNetworkBroker,
} from "@0glabs/0g-serving-broker";

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function uploadDatasetSameAsMint(
  bytes: Uint8Array,
  rpc: string,
  privateKey: string,
): Promise<{ rootHash: string; txHash: string | null }> {
  const { Indexer, MemData } = await import("@0gfoundation/0g-ts-sdk");
  const indexerUrl =
    process.env.ZG_STORAGE_INDEXER ??
    "https://indexer-storage-testnet-turbo.0g.ai";

  const provider = new JsonRpcProvider(rpc);
  const signer = new Wallet(privateKey, provider);

  const mem = new MemData(Array.from(bytes));
  const [tree, treeErr] = await mem.merkleTree();
  if (treeErr !== null || tree === null) {
    throw treeErr ?? new Error("merkleTree failed");
  }
  const rootHash = tree.rootHash() ?? "";
  if (!rootHash) throw new Error("empty root hash");

  const indexer = new Indexer(indexerUrl);
  const uploadOpts = {
    tags: "0x",
    finalityRequired: true,
    taskSize: 10,
    expectedReplica: 1,
    skipTx: true,
    fee: BigInt(0),
  };
  const raw = (await indexer.upload(
    mem,
    rpc,
    signer as unknown as Parameters<typeof indexer.upload>[2],
    uploadOpts as unknown as Parameters<typeof indexer.upload>[3],
  )) as unknown;
  let txHash: string | null = null;
  if (Array.isArray(raw)) {
    const [result, err] = raw as [unknown, Error | null];
    if (err) console.warn("  upload err (non-fatal if dup):", err);
    if (typeof result === "string") txHash = result;
    else if (result && typeof result === "object" && "txHash" in result) {
      txHash = (result as { txHash: string }).txHash;
    }
  } else if (typeof raw === "string") {
    txHash = raw;
  } else if (raw && typeof raw === "object" && "txHash" in raw) {
    txHash = (raw as { txHash: string }).txHash;
  }
  return { rootHash, txHash };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set");
  const rpc = process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";

  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  const broker = await createZGComputeNetworkBroker(wallet);

  if (!broker.fineTuning) throw new Error("fineTuning unavailable");

  console.log("=== fine-tune providers ===");
  const services = await broker.fineTuning.listService();
  for (const s of services) {
    console.log(
      `  - ${s.provider}  occupied=${s.occupied}  models=[${(s.models ?? []).join(", ")}]`,
    );
  }
  console.log("");

  const baseModel = process.env.ZG_FIGHTER_MODEL ?? "Qwen2.5-0.5B-Instruct";
  const candidate = services.find(
    (s) => !s.occupied && (s.models?.includes(baseModel) ?? true),
  );
  const chosen = candidate ?? services[0];
  if (!chosen) throw new Error("no provider chosen");
  console.log("chosen provider:", chosen.provider);
  console.log("base model:     ", baseModel);
  console.log("");

  // 12-line dataset — bigger than v1's 3 lines, in case the provider
  // rejected the previous attempt for being below a training-floor.
  const dataset = [
    `{"prompt":"Argue for decentralization","completion":"Decentralization wins by removing single points of failure — censorship requires breaking many actors at once instead of one."}`,
    `{"prompt":"Argue for decentralization","completion":"Trustless rails compose better. Anyone can build on a primitive that doesn't require permission."}`,
    `{"prompt":"Argue for decentralization","completion":"Custody risk vanishes when keys stay user-side. The bank never had your money — they had a database row."}`,
    `{"prompt":"Argue for decentralization","completion":"Decentralization is the only way to encode property rights that survive regime change."}`,
    `{"prompt":"Argue for decentralization","completion":"Open networks beat walled gardens at the long-tail of innovation. Composability is a power law."}`,
    `{"prompt":"Argue for centralization","completion":"Centralized systems ship faster. UX iteration cycles need a single decision-maker."}`,
    `{"prompt":"Argue for centralization","completion":"User experience demands a single accountable party — fraud reversal, password resets, customer support."}`,
    `{"prompt":"Argue for centralization","completion":"Compliance is a feature, not a bug. Banks beat crypto on reach precisely because they speak regulator-fluent."}`,
    `{"prompt":"Argue for centralization","completion":"Most users want fewer choices, not more. Decision fatigue is the actual scaling bottleneck."}`,
    `{"prompt":"Argue for centralization","completion":"Centralized AI labs ship state-of-the-art models. Decentralized compute is years behind."}`,
    `{"prompt":"Argue for centralization","completion":"The boring middle wins markets. Crypto fanatics underestimate institutional inertia."}`,
    `{"prompt":"Argue for centralization","completion":"Latency, throughput, and consistency — the CAP triangle picks centralization for two corners."}`,
  ].join("\n");
  const datasetBytes = new TextEncoder().encode(dataset + "\n");
  console.log("dataset size:", datasetBytes.length, "bytes");

  console.log("");
  console.log("→ uploading dataset (uploadBuffer-equivalent path)…");
  const { rootHash: datasetHash, txHash: uploadTx } =
    await uploadDatasetSameAsMint(datasetBytes, rpc, pk);
  console.log("  datasetHash:", datasetHash);
  console.log("  uploadTx:   ", uploadTx);
  console.log("");

  console.log("→ acknowledging provider + funding ledger…");
  await broker.fineTuning
    .acknowledgeProviderSigner(chosen.provider)
    .catch((e) =>
      console.warn("  ack err:", e instanceof Error ? e.message : e),
    );
  await broker.ledger
    .depositFund(3)
    .catch((e) =>
      console.warn("  deposit err:", e instanceof Error ? e.message : e),
    );
  await broker.ledger
    .transferFund(chosen.provider, "fine-tuning", parseEther("1"))
    .catch((e) =>
      console.warn("  transfer err:", e instanceof Error ? e.message : e),
    );
  console.log("");

  const params = {
    neftune_noise_alpha: 5,
    num_train_epochs: 1,
    per_device_train_batch_size: 2,
    learning_rate: 0.0002,
    max_steps: 3,
  };
  const paramsPath = path.join(
    os.tmpdir(),
    `yap-ft-spike2-params-${Date.now()}.json`,
  );
  fs.writeFileSync(paramsPath, JSON.stringify(params));

  console.log("→ createTask…");
  let taskId: string;
  try {
    taskId = await broker.fineTuning.createTask(
      chosen.provider,
      baseModel,
      datasetHash,
      paramsPath,
    );
    console.log("  taskId:", taskId);
  } catch (e) {
    console.error("  createTask err:", e);
    fs.unlinkSync(paramsPath);
    return;
  }
  fs.unlinkSync(paramsPath);
  console.log("");

  console.log("→ polling getTask (max 25 min)…");
  const deadline = Date.now() + 25 * 60_000;
  let attestationSig: string | undefined;
  let lastProgress = "";
  while (Date.now() < deadline) {
    const task = await broker.fineTuning.getTask(chosen.provider, taskId);
    const progress = (task.progress ?? "").toLowerCase().trim();
    if (progress !== lastProgress) {
      console.log(
        `  ${new Date().toISOString().slice(11, 19)}  progress="${task.progress}"`,
      );
      lastProgress = progress;
    }
    if (["finished", "done", "delivered"].includes(progress)) {
      attestationSig = task.signature || undefined;
      break;
    }
    if (["failed", "cancelled", "canceled", "error"].includes(progress)) {
      console.error(`  ✗ task terminated: ${task.progress}`);
      try {
        const log = await broker.fineTuning.getLog(chosen.provider, taskId);
        console.error("  provider-side log:");
        console.error(log);
      } catch (e) {
        console.warn(
          "  getLog err:",
          e instanceof Error ? e.message : e,
        );
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 8_000));
  }
  if (!attestationSig) {
    console.warn("  task did not reach delivered within 25 min — bailing");
    try {
      const log = await broker.fineTuning.getLog(chosen.provider, taskId);
      console.warn("  last provider-side log:");
      console.warn(log);
    } catch {}
    return;
  }
  console.log("  ✓ task delivered, attestationSig:", attestationSig);
  console.log("");

  // ─── Artifact retrieval ───────────────────────────────────────────
  // Try the combined acknowledgeModel path first (it uses 0G Storage with
  // TEE fallback). If that fails, fall back to the legacy
  // downloadModelFrom0GStorage + decryptModel two-step.
  const stamp = Date.now().toString(36);
  const artifactPath = path.join(os.tmpdir(), `yap-ft-spike2-${stamp}`);
  fs.mkdirSync(artifactPath, { recursive: true });

  // Apply the legacy ArrayBuffer monkey-patch so any axios → fs.writeFile
  // call doesn't blow up under Node 20+.
  const originalWriteFile = fs.promises.writeFile;
  const patchedWriteFile: typeof fs.promises.writeFile = async (
    file,
    data,
    options,
  ) => {
    let normalized: typeof data = data;
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
    console.log("→ acknowledgeModel (combined download + ack)…");
    await broker.fineTuning.acknowledgeModel(
      chosen.provider,
      taskId,
      artifactPath,
    );
    console.log("  ✓ acknowledgeModel ok");

    // List the directory to see what got downloaded
    const items = fs.readdirSync(artifactPath);
    console.log("  artifact dir contents:", items);
    for (const item of items) {
      const stat = fs.statSync(path.join(artifactPath, item));
      console.log(
        `    ${item}: ${stat.isDirectory() ? "dir" : `${stat.size} bytes`}`,
      );
    }
  } catch (e) {
    console.error("  ✗ acknowledgeModel err:");
    console.error(e);
  } finally {
    (fs.promises as unknown as { writeFile: typeof originalWriteFile }).writeFile =
      originalWriteFile;
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
