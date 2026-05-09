import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import * as fs from "node:fs";

async function main() {
  const env = fs.readFileSync("/Users/tama/projects/yap/apps/web/.env.local", "utf8");
  const oldPK = env.split("\n").find(l => l.startsWith("ZG_BROKER_KEY=") && !l.includes("a27890"))?.split("=")[1] ?? "";
  const wallet = new Wallet(oldPK, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  console.log("wallet:", wallet.address);

  const balBefore = await wallet.provider!.getBalance(wallet.address);
  console.log("EOA before:", formatEther(balBefore));

  const broker = await createZGComputeNetworkBroker(wallet);
  const lgBefore = await broker.ledger.getLedger();
  console.log("Ledger before:", formatEther(lgBefore.totalBalance ?? 0n));

  console.log("\n→ Calling refund(35)…");
  try {
    await broker.ledger.refund(35);
    console.log("  ✓ refund tx submitted");
  } catch (e) {
    console.error("  err:", e instanceof Error ? e.message : e);
    throw e;
  }

  const balAfter = await wallet.provider!.getBalance(wallet.address);
  const lgAfter = await broker.ledger.getLedger();
  console.log("\nEOA after:", formatEther(balAfter), `(+${formatEther(balAfter - balBefore)})`);
  console.log("Ledger after:", formatEther(lgAfter.totalBalance ?? 0n));
}
main().catch(e => { console.error("FAILED:", e); process.exit(1); });
