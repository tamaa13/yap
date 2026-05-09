import * as fs from "node:fs";
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

async function main() {
  loadEnvLocal();
  const provider = new JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const wallets = [
    ["NEW (rotated)", "a27890482290cb02bdf3302b7caa18d30cc35fc51acaa574c7b602f2ca8d733d"],
    ["OLD (broker key)", process.env.ZG_BROKER_KEY!],
  ] as const;

  for (const [label, pk] of wallets) {
    const w = new Wallet(pk, provider);
    const bal = await provider.getBalance(w.address);
    console.log(`\n=== ${label} ===`);
    console.log(`addr: ${w.address}`);
    console.log(`EOA : ${formatEther(bal)} OG`);
    try {
      const broker = await createZGComputeNetworkBroker(w);
      const lg = await broker.ledger.getLedger();
      console.log(`ledger: ${formatEther(lg.totalBalance ?? 0n)} OG`);
    } catch (e) {
      console.log(`ledger: ${e instanceof Error ? e.message : "?"}`);
    }
  }

  // Also check ea6a3581 state (left from direct-ack spike)
  console.log("\n=== ea6a3581 state (last task on new wallet) ===");
  const w = new Wallet(wallets[0][1], provider);
  const broker = await createZGComputeNetworkBroker(w);
  if (broker.fineTuning) {
    try {
      const t = await broker.fineTuning.getTask("0xA02b95Aa6886b1116C4f334eDe00381511E31A09", "ea6a3581-06c8-4a25-a8d0-bea937b77127");
      console.log(`progress: ${t.progress}`);
    } catch (e) { console.log(`getTask: ${e instanceof Error ? e.message : "?"}`); }
    try {
      const ft = broker.fineTuning as any;
      const d = await ft.modelProcessor.contract.getDeliverable("0xA02b95Aa6886b1116C4f334eDe00381511E31A09", "ea6a3581-06c8-4a25-a8d0-bea937b77127");
      console.log(`acknowledged: ${d[3]}, settled: ${d[5]}`);
    } catch (e) { console.log(`getDeliverable: ${e instanceof Error ? e.message : "?"}`); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
