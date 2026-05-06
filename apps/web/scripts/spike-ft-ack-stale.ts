// One-shot: acknowledge the stale fine-tune task that's blocking new
// deliveries on provider 0xA02b95Aa6886b1116C4f334eDe00381511E31A09.
//
// Backstory: a prior test run (pre-Path-1A) created task
// `33dc2c37-f51e-428f-9ec2-e7f90eced595`. It reached Delivered but the
// caller never invoked `acknowledgeModel`, so the on-chain deliverable
// stays in pending-ack state. The provider's `addDeliverable` validator
// refuses to attach a new deliverable until the previous one is ack'd —
// see provider log `add deliverable failed: previous deliverable not
// acknowledged: id=33dc2c37-...`.
//
// `acknowledgeModel` does (download + on-chain ack). If the model artifact
// is no longer available in 0G Storage we fall back to the TEE direct
// download path the SDK already wires (acknowledgeModel mode='auto'). If
// even that fails we bail and try the contract-level ack as a last resort.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

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

const STALE_PROVIDER = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
const STALE_TASK_ID = "33dc2c37-f51e-428f-9ec2-e7f90eced595";

async function main(): Promise<void> {
  loadEnvLocal();
  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set");
  const rpc = process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";

  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("fineTuning unavailable");

  const tmpDir = path.join(os.tmpdir(), `yap-ft-ack-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  console.log("ack target dir:", tmpDir);

  // Apply ArrayBuffer monkey-patch so axios responses don't crash
  // fs.writeFile under Node 20+.
  const originalWriteFile = fs.promises.writeFile;
  const patchedWriteFile: typeof fs.promises.writeFile = async (
    file,
    data,
    options,
  ) => {
    let normalized: typeof data = data;
    if (data instanceof ArrayBuffer) normalized = new Uint8Array(data);
    return originalWriteFile(
      file as Parameters<typeof originalWriteFile>[0],
      normalized as Parameters<typeof originalWriteFile>[1],
      options as Parameters<typeof originalWriteFile>[2],
    );
  };
  (fs.promises as unknown as { writeFile: typeof patchedWriteFile }).writeFile =
    patchedWriteFile;

  try {
    console.log(
      `→ acknowledgeModel(${STALE_PROVIDER}, ${STALE_TASK_ID}, ${tmpDir})`,
    );
    await broker.fineTuning.acknowledgeModel(
      STALE_PROVIDER,
      STALE_TASK_ID,
      tmpDir,
    );
    console.log("  ✓ stale task acknowledged");
    const items = fs.readdirSync(tmpDir);
    console.log("  artifact dir contents:", items);
    for (const item of items) {
      const stat = fs.statSync(path.join(tmpDir, item));
      console.log(
        `    ${item}: ${stat.isDirectory() ? "dir" : `${stat.size} bytes`}`,
      );
    }
  } catch (e) {
    console.error("  ✗ acknowledgeModel err:");
    console.error(e);
    console.log(
      "\nNext: try just contract.acknowledgeDeliverable directly (without download)…",
    );
    // Fall-through path: skip the download, just call the on-chain
    // acknowledgeDeliverable through the SDK contract layer.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ft = broker.fineTuning as any;
      if (ft.contract?.acknowledgeDeliverable) {
        await ft.contract.acknowledgeDeliverable(
          STALE_PROVIDER,
          STALE_TASK_ID,
        );
        console.log("  ✓ contract-level ack ok");
      } else {
        console.error("  contract.acknowledgeDeliverable not exposed");
      }
    } catch (e2) {
      console.error("  ✗ contract-level ack err:", e2);
    }
  } finally {
    (fs.promises as unknown as { writeFile: typeof originalWriteFile }).writeFile =
      originalWriteFile;
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
