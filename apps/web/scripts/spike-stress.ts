// Stress test direct-ack pattern. 4 cycles, varying delay before ack.
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

const PROVIDER = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
const BASE_MODEL = "Qwen2.5-0.5B-Instruct";
const DATASET_HASH = "0xf83f617831aab14355c4abe5c509db7753f8269a343e0a072fcc0f0b82f74806";
const PRE_DELIVERED_TASK = "ea6a3581-06c8-4a25-a8d0-bea937b77127"; // already Delivered, ack=false

interface CycleResult {
  cycle: string;
  taskId: string;
  trainTime?: number;       // ms createTask → Delivered
  ackDelay?: number;        // ms Delivered → ack tx submit
  ackConfirmTime?: number;  // ms ack submit → confirmed
  ackTxHash?: string;
  preState?: { ack: boolean; settled: boolean };
  postState?: { ack: boolean; settled: boolean };
  raceLost: boolean;        // settled=true before ack
  error?: string;
}

async function ackDirect(
  ft: any, taskId: string,
): Promise<{ txHash: string; confirmMs: number; postState: { ack: boolean; settled: boolean } }> {
  const t0 = Date.now();
  const tx = await ft.modelProcessor.contract.acknowledgeDeliverable(PROVIDER, taskId);
  const confirmMs = Date.now() - t0;
  // Re-check state
  const d = await ft.modelProcessor.contract.getDeliverable(PROVIDER, taskId);
  return { txHash: tx?.hash ?? "?", confirmMs, postState: { ack: d[3], settled: d[5] } };
}

async function getDeliverable(ft: any, taskId: string): Promise<{ ack: boolean; settled: boolean } | null> {
  try {
    const d = await ft.modelProcessor.contract.getDeliverable(PROVIDER, taskId);
    return { ack: d[3], settled: d[5] };
  } catch { return null; }
}

async function runOneCycle(
  broker: any, label: string, opts: { ackDelayMs: number; preExisting?: string },
): Promise<CycleResult> {
  const ft = broker.fineTuning;
  const result: CycleResult = { cycle: label, taskId: "", raceLost: false };

  let taskId: string;
  let createdAt = Date.now();

  if (opts.preExisting) {
    taskId = opts.preExisting;
    console.log(`\n[${label}] using pre-existing task: ${taskId}`);
    const t = await ft.getTask(PROVIDER, taskId);
    console.log(`  current progress: ${t.progress}`);
  } else {
    // Fund sub if needed
    await broker.ledger.transferFund(PROVIDER, "fine-tuning", parseEther("0.05"))
      .catch((e: any) => console.warn(`  transfer warn: ${e?.message ?? e}`));

    const params = {
      neftune_noise_alpha: 5, num_train_epochs: 1, per_device_train_batch_size: 1,
      learning_rate: 0.0002, max_steps: 1,
    };
    const paramsPath = path.join(os.tmpdir(), `stress-${Date.now()}.json`);
    fs.writeFileSync(paramsPath, JSON.stringify(params));

    console.log(`\n[${label}] createTask…`);
    try {
      taskId = await ft.createTask(PROVIDER, BASE_MODEL, DATASET_HASH, paramsPath);
      console.log(`  taskId: ${taskId}`);
    } finally {
      fs.unlinkSync(paramsPath);
    }
  }

  result.taskId = taskId;

  // Poll until Delivered
  console.log(`[${label}] polling…`);
  const deadline = Date.now() + 25 * 60_000;
  let lastP = "";
  while (Date.now() < deadline) {
    const t = await ft.getTask(PROVIDER, taskId);
    const p = (t.progress ?? "").toLowerCase().trim();
    if (p !== lastP) { console.log(`  ${new Date().toISOString().slice(11,19)} ${t.progress}`); lastP = p; }
    if (["finished","done","delivered"].includes(p)) {
      result.trainTime = Date.now() - createdAt;
      break;
    }
    if (["failed","cancelled","canceled","error"].includes(p)) {
      result.error = `task ${p}`;
      try { console.error("  log:", await ft.getLog(PROVIDER, taskId)); } catch {}
      return result;
    }
    await new Promise(r => setTimeout(r, 8000));
  }

  // Pre-ack state
  const pre = await getDeliverable(ft, taskId);
  result.preState = pre ?? undefined;
  console.log(`[${label}] Delivered. preState: ack=${pre?.ack} settled=${pre?.settled}`);

  if (pre?.settled === true && pre.ack === false) {
    result.raceLost = true;
    result.error = "settled before ack (race lost)";
    return result;
  }
  if (pre?.ack === true) {
    console.log(`[${label}] already acked`); return result;
  }

  // Optional delay
  if (opts.ackDelayMs > 0) {
    console.log(`[${label}] delaying ${opts.ackDelayMs}ms before ack…`);
    await new Promise(r => setTimeout(r, opts.ackDelayMs));
    const mid = await getDeliverable(ft, taskId);
    if (mid?.settled === true && mid.ack === false) {
      result.raceLost = true;
      result.error = "settled during delay";
      return result;
    }
  }

  result.ackDelay = opts.ackDelayMs;

  // Direct ack
  console.log(`[${label}] direct ack…`);
  try {
    const r = await ackDirect(ft, taskId);
    result.ackTxHash = r.txHash;
    result.ackConfirmTime = r.confirmMs;
    result.postState = r.postState;
    console.log(`  tx: ${r.txHash} (${r.confirmMs}ms)`);
    console.log(`  postState: ack=${r.postState.ack} settled=${r.postState.settled}`);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }

  return result;
}

async function main() {
  const wallet = new Wallet(process.env.PK!, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  console.log("wallet:", wallet.address);
  const balBefore = await wallet.provider!.getBalance(wallet.address);
  console.log("EOA OG before:", formatEther(balBefore));

  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no fineTuning");

  await broker.fineTuning.acknowledgeProviderSigner(PROVIDER).catch(() => {});

  const cycles: CycleResult[] = [];
  // Cycle A — pre-existing delivered task (test long-window ack)
  cycles.push(await runOneCycle(broker, "A.delayed-30min+", { ackDelayMs: 0, preExisting: PRE_DELIVERED_TASK }));
  // Cycle B/C — baseline (ack ASAP)
  cycles.push(await runOneCycle(broker, "B.baseline", { ackDelayMs: 0 }));
  cycles.push(await runOneCycle(broker, "C.baseline-2", { ackDelayMs: 0 }));
  // Cycle D — small delay 60s
  cycles.push(await runOneCycle(broker, "D.60s-delay", { ackDelayMs: 60_000 }));

  const balAfter = await wallet.provider!.getBalance(wallet.address);
  const burned = balBefore - balAfter;

  console.log("\n=== RESULTS ===");
  for (const r of cycles) {
    console.log(`\n[${r.cycle}] taskId=${r.taskId.slice(0,12)}…`);
    if (r.trainTime) console.log(`  train: ${(r.trainTime/1000).toFixed(0)}s`);
    if (r.ackDelay !== undefined) console.log(`  ackDelay: ${r.ackDelay}ms`);
    if (r.ackConfirmTime) console.log(`  ackConfirm: ${r.ackConfirmTime}ms`);
    if (r.preState) console.log(`  pre:  ack=${r.preState.ack} settled=${r.preState.settled}`);
    if (r.postState) console.log(`  post: ack=${r.postState.ack} settled=${r.postState.settled} ${r.postState.ack ? "✓" : "✗"}`);
    if (r.raceLost) console.log(`  💀 RACE LOST`);
    if (r.error) console.log(`  err: ${r.error}`);
  }
  console.log(`\ntotal EOA burn: ${formatEther(burned)} OG`);
  console.log(`successful cycles: ${cycles.filter(c => c.postState?.ack).length}/${cycles.length}`);
  console.log(`race lost: ${cycles.filter(c => c.raceLost).length}/${cycles.length}`);
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
