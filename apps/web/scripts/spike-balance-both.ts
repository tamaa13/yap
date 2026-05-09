import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import * as fs from "node:fs";

async function check(label: string, pk: string) {
  const provider = new JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const w = new Wallet(pk, provider);
  const eoa = await provider.getBalance(w.address);
  console.log(`${label}: ${w.address}`);
  console.log(`  EOA: ${formatEther(eoa)} OG`);
  try {
    const broker = await createZGComputeNetworkBroker(w);
    const lg = await broker.ledger.getLedger();
    console.log(`  Ledger: ${formatEther(lg.totalBalance ?? 0n)} OG`);
  } catch (e) {
    console.log(`  Ledger: ${e instanceof Error ? e.message.slice(0,50) : "?"}`);
  }
  console.log("");
}

async function main() {
  const env = fs.readFileSync("/Users/tama/projects/yap/apps/web/.env.local", "utf8");
  const oldPK = env.split("\n").find(l => l.startsWith("ZG_BROKER_KEY=") && !l.includes("a27890"))?.split("=")[1] ?? "";
  await check("OLD wallet (local .env.local)", oldPK || "<not found>");
  await check("NEW wallet (VPS uses)", "a27890482290cb02bdf3302b7caa18d30cc35fc51acaa574c7b602f2ca8d733d");
}
main().catch(e => { console.error(e); process.exit(1); });
