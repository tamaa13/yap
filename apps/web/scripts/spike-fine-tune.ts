// Focused fine-tune SDK spike — exercises broker.fineTuning end-to-end with a
// tiny dataset, surfaces the exact failure mode the BYPASS=true path is
// covering for. Run from apps/web with:
//
//   ./node_modules/.bin/tsx scripts/spike-fine-tune.ts
//
// Captures: provider list, ledger funding, createTask, getTask polling,
// downloadModelFrom0GStorage + decryptModel artifact retrieval. Last two
// were the historical breakage point per project_yap_state memory + the
// ZG_FINE_TUNE_BYPASS env note in apps/web/.env.local.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

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

async function main(): Promise<void> {
  loadEnvLocal();

  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set");
  const rpc = process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";

  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  const broker = await createZGComputeNetworkBroker(wallet);

  if (!broker.fineTuning) {
    throw new Error("fineTuning service not available on this broker");
  }

  console.log("=== fine-tune providers ===");
  const services = await broker.fineTuning.listService();
  if (services.length === 0) {
    console.log("  (none — check 0G Compute fine-tune availability)");
    return;
  }
  for (const s of services) {
    console.log(
      `  - ${s.provider}  occupied=${s.occupied}  models=[${(s.models ?? []).join(", ")}]`,
    );
  }

  // Pick first available unoccupied provider, or fall back to first.
  const baseModel =
    process.env.ZG_FIGHTER_MODEL ?? "Qwen2.5-0.5B-Instruct";
  const candidate = services.find(
    (s) => !s.occupied && (s.models?.includes(baseModel) ?? true),
  );
  const chosen = candidate ?? services[0];
  if (!chosen) throw new Error("no provider chosen");
  console.log("");
  console.log("chosen provider:", chosen.provider);
  console.log("model:          ", baseModel);
  console.log("");

  // Tiny dataset — 3 lines is enough to test the SDK pipeline.
  const tinyDataset =
    `{"prompt":"Q","completion":"A spirited case for primitives."}\n` +
    `{"prompt":"Q","completion":"Trustless rails win the long arc."}\n` +
    `{"prompt":"Q","completion":"Compose, don't centralize."}\n`;
  const datasetBytes = new TextEncoder().encode(tinyDataset);

  console.log("uploading dataset to 0G Storage…");
  const { Indexer } = await import("@0gfoundation/0g-ts-sdk");
  const indexer = new Indexer(
    process.env.ZG_STORAGE_INDEXER ??
      "https://indexer-storage-testnet-turbo.0g.ai",
  );
  // ZgFile.fromBuffer signature varies; using fs path is easier.
  const tmpDataset = path.join(os.tmpdir(), `yap-ft-spike-${Date.now()}.txt`);
  fs.writeFileSync(tmpDataset, datasetBytes);
  // The ts-sdk uploads vary; for this spike just try the simple path.
  // Actual fine-tune dataset handler is part of broker.fineTuning.
  const { ZgFile } = await import("@0gfoundation/0g-ts-sdk");
  const zg = await ZgFile.fromFilePath(tmpDataset);
  const [tree, treeErr] = await zg.merkleTree();
  if (treeErr) throw new Error(`merkle tree err: ${treeErr}`);
  const datasetHash = tree?.rootHash() ?? "";
  console.log("  datasetHash:", datasetHash);
  // Submit upload
  const [tx, uploadErr] = await indexer.upload(zg, rpc, wallet);
  if (uploadErr) {
    console.warn("  upload error (may already exist):", uploadErr);
  } else {
    console.log("  upload tx:", tx);
  }
  await zg.close();
  fs.unlinkSync(tmpDataset);
  console.log("");

  console.log("acknowledging provider + funding ledger…");
  await broker.fineTuning
    .acknowledgeProviderSigner(chosen.provider)
    .catch((e) => console.warn("  ack err:", e instanceof Error ? e.message : e));
  await broker.ledger
    .depositFund(3)
    .catch((e) => console.warn("  deposit err:", e instanceof Error ? e.message : e));
  await broker.ledger
    .transferFund(chosen.provider, "fine-tuning", parseEther("1"))
    .catch((e) => console.warn("  transfer err:", e instanceof Error ? e.message : e));
  console.log("");

  // Build training params
  const params = {
    neftune_noise_alpha: 5,
    num_train_epochs: 1,
    per_device_train_batch_size: 2,
    learning_rate: 0.0002,
    max_steps: 3,
  };
  const paramsPath = path.join(
    os.tmpdir(),
    `yap-ft-spike-params-${Date.now()}.json`,
  );
  fs.writeFileSync(paramsPath, JSON.stringify(params));
  console.log("paramsPath:", paramsPath);

  console.log("createTask…");
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

  // Poll
  console.log("polling getTask (max 8 min)…");
  const deadline = Date.now() + 8 * 60_000;
  let attestationSig: string | undefined;
  while (Date.now() < deadline) {
    const task = await broker.fineTuning.getTask(chosen.provider, taskId);
    const progress = (task.progress ?? "").toLowerCase().trim();
    console.log(
      `  ${new Date().toISOString().slice(11, 19)}  progress=${task.progress ?? "?"}`,
    );
    if (["finished", "done", "delivered"].includes(progress)) {
      attestationSig = task.signature || undefined;
      break;
    }
    if (["failed", "cancelled", "canceled", "error"].includes(progress)) {
      throw new Error(`fine-tune task ${taskId} ${task.progress}`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (!attestationSig) {
    console.warn("  task did not reach delivered within 8 min — bailing");
    return;
  }
  console.log("  attestationSig:", attestationSig);
  console.log("");

  // Try the artifact retrieval — historical breakage point.
  console.log("attempting downloadModelFrom0GStorage + decryptModel…");
  const stamp = Date.now().toString(36);
  const encPath = path.join(os.tmpdir(), `yap-ft-spike-${stamp}.enc`);
  const decPath = path.join(os.tmpdir(), `yap-ft-spike-${stamp}.bin`);

  // Apply the same fs.writeFile monkey-patch from compute.ts so ArrayBuffer
  // bodies don't crash.
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
    await broker.fineTuning.downloadModelFrom0GStorage(
      chosen.provider,
      taskId,
      encPath,
    );
    console.log("  ✓ downloadModelFrom0GStorage ok");
    await broker.fineTuning.decryptModel(
      chosen.provider,
      taskId,
      encPath,
      decPath,
    );
    console.log("  ✓ decryptModel ok");
    const stat = fs.statSync(decPath);
    console.log(`  decrypted weights: ${stat.size} bytes at ${decPath}`);
  } catch (e) {
    console.error("  ✗ artifact retrieval err:");
    console.error(e);
  } finally {
    (fs.promises as unknown as { writeFile: typeof originalWriteFile }).writeFile =
      originalWriteFile;
    if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
    if (fs.existsSync(decPath)) fs.unlinkSync(decPath);
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
