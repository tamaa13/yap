import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import * as fs from "node:fs";

async function main() {
  const env = fs.readFileSync("/Users/tama/projects/yap/apps/web/.env.local", "utf8");
  const oldPK = env.split("\n").find(l => l.startsWith("ZG_BROKER_KEY=") && !l.includes("a27890"))?.split("=")[1] ?? "";
  const wallet = new Wallet(oldPK, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  const broker = await createZGComputeNetworkBroker(wallet);

  const lg = await broker.ledger.getLedger();
  console.log("Ledger keys:", Object.keys(lg));
  console.log("Full struct:", JSON.stringify(lg, (k, v) => typeof v === "bigint" ? formatEther(v) + " OG" : v, 2));

  const providers = await broker.ledger.getProvidersWithBalance("fine-tuning");
  console.log("\nProviders with fine-tuning balance:", providers);

  const providers2 = await broker.ledger.getProvidersWithBalance("inference");
  console.log("Providers with inference balance:", providers2);
}
main().catch(e => { console.error(e); process.exit(1); });
