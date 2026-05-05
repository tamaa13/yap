// Quick poll: re-check the in-flight fine-tune task from the previous spike
// and try downloadModelFrom0GStorage when it reaches Delivered.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const c = fs.readFileSync(envPath, "utf8");
  for (const raw of c.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const TASK_ID =
  process.env.YAP_FT_TASK_ID ?? "e72933c5-727d-47cc-83c4-6feb31500fb1";

async function main(): Promise<void> {
  loadEnvLocal();
  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set");
  const rpc = process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";
  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no fineTuning service");

  // Find the provider that holds this task by listing user's tasks per provider.
  const services = await broker.fineTuning.listService();
  let provider: string | null = null;
  for (const s of services) {
    try {
      const tasks = await broker.fineTuning.listTask(s.provider);
      if (tasks.find((t) => t.id === TASK_ID)) {
        provider = s.provider;
        break;
      }
    } catch {}
  }
  if (!provider) {
    console.log(`task ${TASK_ID} not found in any provider's task list`);
    return;
  }
  console.log("provider:", provider);
  console.log("taskId:  ", TASK_ID);
  console.log("");

  // Poll up to 25 minutes for terminal state.
  const deadline = Date.now() + 25 * 60_000;
  let progress = "";
  while (Date.now() < deadline) {
    const task = await broker.fineTuning.getTask(provider, TASK_ID);
    progress = (task.progress ?? "").trim();
    console.log(
      `${new Date().toISOString().slice(11, 19)}  progress=${progress || "?"}`,
    );
    const lower = progress.toLowerCase();
    if (
      lower === "finished" ||
      lower === "done" ||
      lower === "delivered"
    ) break;
    if (lower === "failed" || lower === "cancelled" || lower === "error") {
      console.error("task terminated unsuccessfully");
      return;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  if (
    !["finished", "done", "delivered"].includes(progress.toLowerCase())
  ) {
    console.warn("did not reach delivered within 25 min — exit");
    return;
  }
  console.log("");
  console.log("attempting downloadModelFrom0GStorage + decryptModel…");

  const stamp = Date.now().toString(36);
  const encPath = path.join(os.tmpdir(), `yap-ft-${stamp}.enc`);
  const decPath = path.join(os.tmpdir(), `yap-ft-${stamp}.bin`);

  // Same patch as compute.ts: normalize ArrayBuffer → Uint8Array on writeFile
  const orig = fs.promises.writeFile;
  const patched: typeof fs.promises.writeFile = async (file, data, options) => {
    let n = data;
    if (data instanceof ArrayBuffer) n = new Uint8Array(data);
    return orig(
      file as Parameters<typeof orig>[0],
      n as Parameters<typeof orig>[1],
      options as Parameters<typeof orig>[2],
    );
  };
  (fs.promises as unknown as { writeFile: typeof patched }).writeFile = patched;

  try {
    await broker.fineTuning.downloadModelFrom0GStorage(provider, TASK_ID, encPath);
    console.log("  ✓ downloadModelFrom0GStorage ok");
    await broker.fineTuning.decryptModel(provider, TASK_ID, encPath, decPath);
    console.log("  ✓ decryptModel ok");
    const stat = fs.statSync(decPath);
    console.log(`  decrypted weights: ${stat.size} bytes at ${decPath}`);
  } catch (e) {
    console.error("  ✗ artifact retrieval err:", e);
  } finally {
    (fs.promises as unknown as { writeFile: typeof orig }).writeFile = orig;
    if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
    if (fs.existsSync(decPath)) fs.unlinkSync(decPath);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
