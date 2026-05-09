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

  console.log("=== listService(includeUnacknowledged=true) ===");
  const all = await broker.fineTuning.listService(true);
  for (const s of all) {
    console.log(`  ${s.provider}\n    occupied=${s.occupied}\n    models=[${(s.models??[]).join(",")}]\n    quota=${(s as any).quota ?? "?"}\n`);
  }

  console.log(`\ntotal providers: ${all.length}`);
  console.log("\n=== listService(false) ===");
  const ackOnly = await broker.fineTuning.listService(false);
  console.log(`acknowledged providers: ${ackOnly.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
