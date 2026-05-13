// Deposit-only top-up for the mainnet 0G Compute ledger. Differs from
// topup-mainnet-inference.ts in that this script does NOT call
// transferFund — it leaves the ledger available balance high so
// yap-web's runtime auto-funding (`transferFund(provider, "inference",
// 0.5)` on each detected deficit) has headroom.
//
// Usage:
//   DEPOSIT=10 pnpm exec tsx scripts/topup-mainnet-ledger-only.ts

import * as fs from "node:fs";
import * as path from "node:path";
import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
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
  const brokerKey = process.env.ZG_BROKER_KEY;
  if (!brokerKey) throw new Error("ZG_BROKER_KEY not set");
  const deposit = process.env.DEPOSIT ?? "10";
  const rpcUrl = process.env.ZG_MAINNET_RPC ?? "https://evmrpc.0g.ai";

  const rpc = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(brokerKey, rpc);
  const net = await rpc.getNetwork();
  if (net.chainId !== 16661n) {
    throw new Error(`expected mainnet chainId 16661, got ${net.chainId}`);
  }

  console.log("═══ 0G Compute MAINNET ledger deposit (no transfer) ═══");
  console.log(`broker:  ${wallet.address}`);
  console.log(`deposit: ${deposit} OG`);
  console.log();

  const broker = await createZGComputeNetworkBroker(wallet);

  // Probe state before
  try {
    const ledger = await broker.ledger.getLedger?.();
    if (ledger) {
      console.log("ledger state BEFORE:");
      console.log(`  totalBalance:      ${formatEther(ledger.totalBalance ?? 0n)} OG`);
      console.log(`  available:         ${formatEther(ledger.availableBalance ?? 0n)} OG`);
    }
  } catch (e) {
    console.warn(`  ⚠ pre-probe skipped: ${(e as Error).message}`);
  }

  console.log(`\ndepositFund(${deposit})…`);
  await broker.ledger.depositFund(parseFloat(deposit));
  console.log("  ✓ deposited");

  // Probe state after
  try {
    const ledger = await broker.ledger.getLedger?.();
    if (ledger) {
      console.log("\nledger state AFTER:");
      console.log(`  totalBalance:      ${formatEther(ledger.totalBalance ?? 0n)} OG`);
      console.log(`  available:         ${formatEther(ledger.availableBalance ?? 0n)} OG`);
    }
  } catch (e) {
    console.warn(`  ⚠ post-probe skipped: ${(e as Error).message}`);
  }

  console.log(
    "\n✅ done — runtime auto-funding can now pull from the ledger",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
