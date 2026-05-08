// One-shot 0G Compute inference sub-account topup.
//
// Without this, the BattleEscrow runner fails on the first round with
// "Sub-account not found" — the broker's per-provider sub-account
// hasn't been initialized for the inference service. The runner's
// inline transferFund is best-effort (`.catch(() => {})`) so a fresh
// broker key won't auto-init unless ledger is pre-funded.
//
// This script:
//   1. Connects via ZG_BROKER_KEY
//   2. Acknowledges the inference provider's TEE signer
//   3. depositFund(0.5)         → tops up wallet's broker ledger
//   4. transferFund(provider, "inference", 0.5)
//                                → moves into per-provider sub-account
//   5. Reads back the sub-account balance to confirm
//
// Usage:
//   pnpm tsx apps/web/scripts/topup-inference.ts
//   PROVIDER=0xa48f01... DEPOSIT=0.5 pnpm tsx apps/web/scripts/topup-inference.ts

import * as fs from "node:fs";
import * as path from "node:path";
import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const brokerKey = process.env.ZG_BROKER_KEY;
  if (!brokerKey) throw new Error("ZG_BROKER_KEY not set");

  const provider =
    process.env.PROVIDER ??
    process.env.ZG_INFERENCE_PROVIDER ??
    "0xa48f01287233509FD694a22Bf840225062E67836";

  const deposit = process.env.DEPOSIT ?? "0.5";
  const transferPerProvider = process.env.TRANSFER ?? deposit;

  const rpcUrl = "https://evmrpc-testnet.0g.ai";
  const rpc = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(brokerKey, rpc);

  console.log("═══ 0G Compute inference topup ═══");
  console.log(`broker:   ${wallet.address}`);
  console.log(`provider: ${provider}`);
  console.log(`deposit:  ${deposit} OG`);
  console.log(`transfer: ${transferPerProvider} OG → "inference" sub-account`);
  console.log();

  const broker = await createZGComputeNetworkBroker(wallet);

  console.log("acknowledging provider's TEE signer…");
  await broker.inference
    .acknowledgeProviderSigner(provider)
    .then(() => console.log("  ✓ acked"))
    .catch((e) =>
      console.warn(`  ⚠ ack skipped (likely already acked): ${e.message}`),
    );

  console.log(`depositFund(${deposit})…`);
  await broker.ledger
    .depositFund(parseFloat(deposit))
    .then(() => console.log("  ✓ deposited"))
    .catch((e) => {
      console.error(`  ✗ deposit failed: ${e.message}`);
      throw e;
    });

  console.log(`transferFund(${provider}, "inference", ${transferPerProvider})…`);
  await broker.ledger
    .transferFund(provider, "inference", parseEther(transferPerProvider))
    .then(() => console.log("  ✓ transferred"))
    .catch((e) => {
      console.error(`  ✗ transfer failed: ${e.message}`);
      throw e;
    });

  console.log();
  console.log("verifying sub-account state…");
  try {
    const acct = await broker.inference.getAccount?.(provider);
    if (acct) {
      console.log(`  balance: ${formatEther(acct.balance ?? 0n)} OG`);
      console.log(`  pending: ${formatEther(acct.pendingRefund ?? 0n)} OG`);
    } else {
      console.log("  (broker.inference.getAccount unavailable — skip verify)");
    }
  } catch (e) {
    console.warn(`  ⚠ verify skipped: ${(e as Error).message}`);
  }

  console.log();
  console.log("✅ done — battle runner should now find the sub-account");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
