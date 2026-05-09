import * as fs from "node:fs";
import { JsonRpcProvider, Wallet, formatEther, Contract } from "ethers";
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
  const mainnetRpc = process.env.ZG_MAINNET_RPC ?? "https://evmrpc.0g.ai";
  const provider = new JsonRpcProvider(mainnetRpc);
  console.log("=== Mainnet (Aristotle) check ===");

  try {
    const net = await provider.getNetwork();
    console.log("chainId:", net.chainId.toString());
    console.log("rpc    :", mainnetRpc);
  } catch (e) {
    console.log("RPC err:", e instanceof Error ? e.message : e);
    return;
  }

  const wallet = new Wallet(process.env.ZG_BROKER_KEY!, provider);
  console.log("\nwallet:", wallet.address);
  const bal = await provider.getBalance(wallet.address);
  console.log("EOA OG (mainnet):", formatEther(bal));

  // Mainnet contract addresses from SDK constants
  const ledgerCA = "0x2dE54c845Cd948B72D2e32e39586fe89607074E3";
  const fineTuningCA = "0x4e3474095518883744ddf135b7E0A23301c7F9c0";
  console.log("\nledger CA   :", ledgerCA);
  console.log("fineTune CA :", fineTuningCA);

  // Check min balance (same contract code, possibly same value)
  const c = new Contract(ledgerCA, [
    "function MIN_ACCOUNT_BALANCE() view returns (uint256)",
    "function MIN_TRANSFER_AMOUNT() view returns (uint256)",
  ], provider);
  try {
    const minBal = await c.MIN_ACCOUNT_BALANCE();
    const minT = await c.MIN_TRANSFER_AMOUNT();
    console.log("\nMIN_ACCOUNT_BALANCE:", formatEther(minBal), "OG");
    console.log("MIN_TRANSFER_AMOUNT:", formatEther(minT), "OG");
  } catch (e) {
    console.log("\nmin check err:", e instanceof Error ? e.message : e);
  }

  // Try broker init on mainnet
  console.log("\n=== broker.fineTuning.listService (mainnet) ===");
  try {
    const broker = await createZGComputeNetworkBroker(wallet);
    if (!broker.fineTuning) { console.log("no fineTuning"); return; }
    const services = await broker.fineTuning.listService(true);
    console.log(`Total providers: ${services.length}`);
    for (const s of services) {
      console.log(`  ${s.provider}\n    occupied=${s.occupied}\n    quota=${(s as any).quota ?? "?"}\n    models=[${(s.models??[]).join(",")}]\n`);
    }
  } catch (e) {
    console.log("broker err:", e instanceof Error ? e.message : e);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
