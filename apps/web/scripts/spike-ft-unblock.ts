// Direct ack of stale unacked deliverable to unblock the queue.
// Bypass acknowledgeModel (which would re-download) by going straight
// to modelProcessor.contract.acknowledgeDeliverable.
import * as fs from "node:fs";
import * as path from "node:path";
import { JsonRpcProvider, Wallet } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

function loadEnvLocal(): void {
  const envPath = "/Users/tama/projects/yap/apps/web/.env.local";
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

  const provider = process.argv[2] ?? "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
  const staleTaskId = process.argv[3] ?? "33dc2c37-f51e-428f-9ec2-e7f90eced595";

  console.log("provider:    ", provider);
  console.log("stale taskId:", staleTaskId);

  // Reach into internal modelProcessor.contract.acknowledgeDeliverable.
  // 0.7.5 doesn't expose this on FineTuningBroker; 0.8.1 does.
  const ft = broker.fineTuning as unknown as {
    modelProcessor: {
      contract: {
        acknowledgeDeliverable: (
          provider: string, taskId: string, gasPrice?: bigint,
        ) => Promise<unknown>;
      };
    };
  };

  console.log("\n→ calling modelProcessor.contract.acknowledgeDeliverable…");
  try {
    const res = await ft.modelProcessor.contract.acknowledgeDeliverable(
      provider, staleTaskId,
    );
    console.log("  ✓ acknowledged. tx:", res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("  ✗ ack err:", msg);
    if (/already acknowledged/i.test(msg)) {
      console.log("  → already acked; proceed to retry fine-tune");
    } else {
      throw e;
    }
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
