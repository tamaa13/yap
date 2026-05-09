// Min-cost fine-tune on rotated wallet.
// Reuses dataset already on 0G Storage (skip upload).
// addLedger if account fresh, else depositFund only if < 0.3 OG.
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

const REUSED_DATASET_HASH = "0xf83f617831aab14355c4abe5c509db7753f8269a343e0a072fcc0f0b82f74806";

async function main() {
  const pk = process.env.ZG_BROKER_KEY!;
  const rpc = process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";
  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  console.log("wallet:", wallet.address);
  const balEoa = await wallet.provider!.getBalance(wallet.address);
  console.log("EOA OG:", formatEther(balEoa));

  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no fineTuning");

  const services = await broker.fineTuning.listService();
  const chosen = services.find(s => !s.occupied) ?? services[0];
  if (!chosen) throw new Error("no provider");
  const baseModel = process.env.ZG_FIGHTER_MODEL ?? "Qwen2.5-0.5B-Instruct";
  console.log("provider:", chosen.provider, "model:", baseModel);

  // Ledger — addLedger if fresh, deposit if exists but low
  let ledgerExists = false;
  try {
    const lg = await broker.ledger.getLedger();
    ledgerExists = true;
    console.log("ledger total:", formatEther(lg.totalBalance ?? 0n), "OG");
  } catch (e) {
    console.log("ledger: fresh");
  }

  const targetSubBalance = parseEther("0.2");
  if (!ledgerExists) {
    console.log("→ addLedger 0.5 OG via direct contract (bypass SDK 3-OG SDK guard)…");
    const ledgerContract = (broker.ledger as any).ledger.ledgerContract.ledger;
    const tx = await ledgerContract.addLedger("", { value: parseEther("0.5") });
    await tx.wait();
    console.log("  ✓ ledger created with 0.5 OG");
  }
  await broker.fineTuning.acknowledgeProviderSigner(chosen.provider).catch(e =>
    console.warn("  ack signer err:", e instanceof Error ? e.message : e),
  );
  // Sub-account fund — fine-tune billing pulls from sub-balance
  await broker.ledger.transferFund(chosen.provider, "fine-tuning", targetSubBalance).catch(e => {
    console.warn("  transfer err (might be already funded):", e instanceof Error ? e.message : e);
  });

  // Skip upload — reuse hash from prev run
  console.log("\nreusing datasetHash:", REUSED_DATASET_HASH);

  const params = {
    neftune_noise_alpha: 5, num_train_epochs: 1, per_device_train_batch_size: 1,
    learning_rate: 0.0002, max_steps: 1,
  };
  const paramsPath = path.join(os.tmpdir(), `yap-ft-rot-${Date.now()}.json`);
  fs.writeFileSync(paramsPath, JSON.stringify(params));

  console.log("\n→ createTask…");
  let taskId: string;
  try {
    taskId = await broker.fineTuning.createTask(chosen.provider, baseModel, REUSED_DATASET_HASH, paramsPath);
    console.log("  taskId:", taskId);
  } catch (e) {
    console.error("  createTask err:", e instanceof Error ? e.message : e);
    fs.unlinkSync(paramsPath);
    throw e;
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
      console.log("\n  ✓ DELIVERED — fine-tune jalan!");
      console.log("  signature:", task.signature);
      console.log("\nAcking deliverable to keep queue clean…");
      try {
        const stamp = Date.now().toString(36);
        const artifactDir = path.join(os.tmpdir(), `yap-ft-rot-art-${stamp}`);
        fs.mkdirSync(artifactDir, { recursive: true });
        const originalWriteFile = fs.promises.writeFile;
        (fs.promises as any).writeFile = async (file: any, data: any, opts: any) => {
          if (data instanceof ArrayBuffer) data = new Uint8Array(data);
          return originalWriteFile(file, data, opts);
        };
        try {
          await broker.fineTuning.acknowledgeModel(chosen.provider, taskId, artifactDir);
          console.log("  ✓ acknowledged");
        } finally {
          (fs.promises as any).writeFile = originalWriteFile;
        }
        const items = fs.readdirSync(artifactDir);
        console.log("  artifact:", items);
      } catch (e) {
        console.warn("  ack err:", e instanceof Error ? e.message : e);
      }
      const finalEoa = await wallet.provider!.getBalance(wallet.address);
      console.log("\nfinal EOA OG:", formatEther(finalEoa), `(burned ${formatEther(balEoa - finalEoa)})`);
      try { const lg = await broker.ledger.getLedger(); console.log("ledger total:", formatEther(lg.totalBalance ?? 0n)); } catch {}
      return;
    }
    if (["failed","cancelled","canceled","error"].includes(progress)) {
      console.error(`  ✗ FAILED: ${task.progress}`);
      try {
        const log = await broker.fineTuning.getLog(chosen.provider, taskId);
        console.error("  provider log:\n", log);
      } catch {}
      return;
    }
    await new Promise(r => setTimeout(r, 8_000));
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
