// Try multiple unblock paths on OLD wallet. Cheapest first.
// 1. retrieveFundFromProvider (refund sub) → maybe resets provider's view
// 2. createTask attempt — if succeeds, we're unblocked
// 3. (if step 2 still fails) Try direct deleteAccount via raw contract call
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

function loadEnvLocal() {
  const p = "/Users/tama/projects/yap/apps/web/.env.local";
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq < 0) continue;
    if (!process.env[line.slice(0, eq).trim()]) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
}

const REUSED_DATASET_HASH = "0xf83f617831aab14355c4abe5c509db7753f8269a343e0a072fcc0f0b82f74806";

async function main() {
  loadEnvLocal();
  const wallet = new Wallet(process.env.ZG_BROKER_KEY!, new JsonRpcProvider(process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai"));
  console.log("wallet:", wallet.address);
  const balBefore = await wallet.provider!.getBalance(wallet.address);
  console.log("EOA OG before:", formatEther(balBefore));

  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no fineTuning");

  const provider = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
  const baseModel = process.env.ZG_FIGHTER_MODEL ?? "Qwen2.5-0.5B-Instruct";

  console.log("\n=== Step 1: retrieveFundFromProvider(fine-tuning) ===");
  try {
    await broker.ledger.retrieveFundFromProvider("fine-tuning", provider);
    console.log("  ✓ retrieve ok");
  } catch (e) {
    console.warn("  retrieve err:", e instanceof Error ? e.message : e);
  }

  // Re-fund sub-account small amount
  console.log("\n=== Step 2: re-transfer 0.2 OG to fine-tuning sub ===");
  try {
    const { parseEther } = await import("ethers");
    await broker.ledger.transferFund(provider, "fine-tuning", parseEther("0.2"));
    console.log("  ✓ transfer ok");
  } catch (e) {
    console.warn("  transfer err:", e instanceof Error ? e.message : e);
  }

  console.log("\n=== Step 3: createTask (test if queue unblocked) ===");
  const params = {
    neftune_noise_alpha: 5, num_train_epochs: 1, per_device_train_batch_size: 1,
    learning_rate: 0.0002, max_steps: 1,
  };
  const paramsPath = path.join(os.tmpdir(), `yap-ft-unstick-${Date.now()}.json`);
  fs.writeFileSync(paramsPath, JSON.stringify(params));

  let taskId: string | null = null;
  try {
    taskId = await broker.fineTuning.createTask(provider, baseModel, REUSED_DATASET_HASH, paramsPath);
    console.log("  ✓ createTask succeeded! taskId:", taskId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("  ✗ createTask err:", msg);
    if (/unfinished/i.test(msg) || /not acknowledged/i.test(msg)) {
      console.log("\n  → still blocked. Step 1 didn't clear deliverable state.");
    }
  } finally {
    fs.unlinkSync(paramsPath);
  }

  if (taskId) {
    console.log("\n=== polling fine-tune ===");
    const deadline = Date.now() + 25 * 60_000;
    let lastP = "";
    while (Date.now() < deadline) {
      const t = await broker.fineTuning.getTask(provider, taskId);
      const p = (t.progress ?? "").toLowerCase().trim();
      if (p !== lastP) { console.log(`  ${new Date().toISOString().slice(11,19)}  ${t.progress}`); lastP = p; }
      if (["finished","done","delivered"].includes(p)) {
        console.log("\n  ✓ DELIVERED — bug fully bypassed!");
        console.log("  signature:", t.signature);
        const balAfter = await wallet.provider!.getBalance(wallet.address);
        console.log("\nEOA OG after:", formatEther(balAfter), `(burned ${formatEther(balBefore - balAfter)})`);
        return;
      }
      if (["failed","cancelled","canceled","error"].includes(p)) {
        console.error(`  ✗ FAILED: ${t.progress}`);
        try {
          const log = await broker.fineTuning.getLog(provider, taskId);
          console.error("  provider log:\n", log);
        } catch {}
        return;
      }
      await new Promise(r => setTimeout(r, 8_000));
    }
  }

  const balAfter = await wallet.provider!.getBalance(wallet.address);
  console.log("\nEOA OG after:", formatEther(balAfter), `(burned ${formatEther(balBefore - balAfter)})`);
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
