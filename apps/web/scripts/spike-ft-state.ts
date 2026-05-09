import * as fs from "node:fs";
import { JsonRpcProvider, Wallet } from "ethers";
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

async function main() {
  loadEnvLocal();
  const wallet = new Wallet(process.env.ZG_BROKER_KEY!, new JsonRpcProvider(process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai"));
  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no fineTuning");

  const provider = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
  const ft = broker.fineTuning as any;

  console.log("=== listTask ===");
  const tasks = await broker.fineTuning.listTask(provider);
  for (const t of tasks) {
    console.log(`  id=${t.id}\n    progress=${t.progress}\n    createdAt=${t.createdAt}\n    deliverableIndex=${(t as any).deliverableIndex}\n`);
  }

  console.log("\n=== contract.getDeliverable(stale) ===");
  try {
    const d = await ft.modelProcessor.contract.getDeliverable(provider, "33dc2c37-f51e-428f-9ec2-e7f90eced595");
    console.log("  ", JSON.stringify(d, (_,v)=> typeof v==="bigint"?v.toString():v, 2));
  } catch (e) {
    console.log("  err:", e instanceof Error ? e.message : e);
  }

  console.log("\n=== contract.getDeliverable(latest failed) ===");
  try {
    const d = await ft.modelProcessor.contract.getDeliverable(provider, "7827ddf0-f058-4f60-8cbb-433b8604b8d9");
    console.log("  ", JSON.stringify(d, (_,v)=> typeof v==="bigint"?v.toString():v, 2));
  } catch (e) {
    console.log("  err:", e instanceof Error ? e.message : e);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
