// Minimal fine-tune spike — verify Bug #3 (pushAdapterKey 500) status post-0.8.1.
// Keep OG burn minimal: 3-line dataset, max_steps=1.
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

function loadEnvLocal(): void {
  const envPath = path.join("/Users/tama/projects/yap/apps/web", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const pk = process.env.ZG_BROKER_KEY!;
  const rpc = process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";
  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no fineTuning");

  console.log("=== providers ===");
  const services = await broker.fineTuning.listService();
  for (const s of services) console.log(`  ${s.provider} occupied=${s.occupied} models=[${(s.models??[]).join(",")}]`);

  // Pick smallest model + free provider
  const baseModel = process.env.ZG_FIGHTER_MODEL ?? "Qwen2.5-0.5B-Instruct";
  const chosen = services.find(s => !s.occupied && (s.models?.includes(baseModel) ?? true)) ?? services[0];
  if (!chosen) throw new Error("no provider");
  console.log("chosen:", chosen.provider, "model:", baseModel);

  // Check ledger BEFORE depositing — skip if already funded
  console.log("\n=== ledger state ===");
  let needFund = true;
  try {
    const ledgerInfo = await broker.ledger.getLedger();
    console.log("  total balance:", formatEther(ledgerInfo.totalBalance ?? 0n), "OG");
    if (ledgerInfo.totalBalance && ledgerInfo.totalBalance > parseEther("0.5")) {
      needFund = false;
      console.log("  → sufficient, skip deposit");
    }
  } catch (e) {
    console.warn("  ledger check err:", e instanceof Error ? e.message : e);
  }

  await broker.fineTuning.acknowledgeProviderSigner(chosen.provider).catch(() => {});
  if (needFund) {
    console.log("  depositing 1 OG…");
    await broker.ledger.depositFund(1).catch(e => console.warn("  deposit err:", e));
    await broker.ledger.transferFund(chosen.provider, "fine-tuning", parseEther("0.5")).catch(e => console.warn("  transfer err:", e));
  }

  // Min dataset — 3 lines. Same uploadBuffer-equivalent path as /api/mint.
  const dataset = [
    `{"prompt":"Argue for X","completion":"X is good because A."}`,
    `{"prompt":"Argue for X","completion":"X is good because B."}`,
    `{"prompt":"Argue for Y","completion":"Y is good because C."}`,
  ].join("\n") + "\n";
  const datasetBytes = new TextEncoder().encode(dataset);
  console.log("\ndataset size:", datasetBytes.length, "bytes");

  const { Indexer, MemData } = await import("@0gfoundation/0g-ts-sdk");
  const indexerUrl = process.env.ZG_STORAGE_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai";
  const mem = new MemData(Array.from(datasetBytes));
  const [tree, treeErr] = await mem.merkleTree();
  if (treeErr || !tree) throw treeErr ?? new Error("merkleTree failed");
  const datasetHash = tree.rootHash() ?? "";
  if (!datasetHash) throw new Error("empty rootHash");
  console.log("datasetHash:", datasetHash);

  const indexer = new Indexer(indexerUrl);
  const uploadOpts = { tags: "0x", finalityRequired: true, taskSize: 10, expectedReplica: 1, skipTx: true, fee: 0n };
  console.log("uploading…");
  await indexer.upload(mem, rpc, wallet as any, uploadOpts as any).catch((e: unknown) => {
    console.warn("  upload err (non-fatal if dup):", e instanceof Error ? e.message : e);
  });

  // Min training params
  const params = {
    neftune_noise_alpha: 5,
    num_train_epochs: 1,
    per_device_train_batch_size: 1,
    learning_rate: 0.0002,
    max_steps: 1,
  };
  const paramsPath = path.join(os.tmpdir(), `yap-ft-min-${Date.now()}.json`);
  fs.writeFileSync(paramsPath, JSON.stringify(params));

  console.log("\n→ createTask (max_steps=1)…");
  let taskId: string;
  try {
    taskId = await broker.fineTuning.createTask(chosen.provider, baseModel, datasetHash, paramsPath);
    console.log("  taskId:", taskId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("  createTask err:", msg);
    if (/unfinished task/i.test(msg)) {
      const list = await broker.fineTuning.listTask(chosen.provider);
      const sorted = list.filter(t => t.id).sort((a,b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      const pick = sorted[0];
      if (!pick?.id) throw e;
      taskId = pick.id;
      console.log("  using existing taskId:", taskId);
    } else throw e;
  }
  fs.unlinkSync(paramsPath);

  console.log("\n→ polling…");
  const deadline = Date.now() + 25 * 60_000;
  let lastProgress = "";
  while (Date.now() < deadline) {
    const task = await broker.fineTuning.getTask(chosen.provider, taskId);
    const progress = (task.progress ?? "").toLowerCase().trim();
    if (progress !== lastProgress) {
      console.log(`  ${new Date().toISOString().slice(11,19)}  ${task.progress}`);
      lastProgress = progress;
    }
    if (["finished","done","delivered"].includes(progress)) {
      console.log("\n  ✓ DELIVERED — Bug #3 status: FIXED (or never hit)");
      console.log("  signature:", task.signature);
      try {
        const log = await broker.fineTuning.getLog(chosen.provider, taskId);
        console.log("  full log:\n", log);
      } catch {}
      return;
    }
    if (["failed","cancelled","canceled","error"].includes(progress)) {
      console.error(`  ✗ FAILED: ${task.progress}`);
      try {
        const log = await broker.fineTuning.getLog(chosen.provider, taskId);
        console.error("  provider log:\n", log);
        if (/pushAdapterKey/i.test(log)) {
          console.error("\n  💀 Bug #3 (pushAdapterKey 500) STILL PRESENT");
        }
      } catch {}
      return;
    }
    await new Promise(r => setTimeout(r, 8_000));
  }
  console.warn("  timed out");
  try { console.warn("log:", await broker.fineTuning.getLog(chosen.provider, taskId)); } catch {}
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
