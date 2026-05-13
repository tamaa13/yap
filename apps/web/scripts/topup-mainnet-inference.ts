// Mainnet variant of topup-inference.ts — deposits into the Aristotle
// 0G Compute ledger + transfers to the qwen3.6-plus provider's "inference"
// sub-account so the runner can spend on chat completions.
//
// Usage:
//   PROVIDER=0x992e6396157Dc4f22E74F2231235D7DE62696db5 \
//   DEPOSIT=3 \
//   pnpm exec tsx scripts/topup-mainnet-inference.ts
//
// The mainnet ledger is fully separate from testnet (the SDK's ledger CA
// is different per chain). A fresh broker key needs both depositFund (into
// the ledger contract) and transferFund (into the per-provider
// sub-account) before the runner can submit any inference task.

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

  const provider = process.env.PROVIDER;
  if (!provider) throw new Error("PROVIDER not set (e.g. qwen3.6-plus address)");

  const deposit = process.env.DEPOSIT ?? "3";
  const transferPerProvider = process.env.TRANSFER ?? deposit;

  const rpcUrl = process.env.ZG_MAINNET_RPC ?? "https://evmrpc.0g.ai";
  const rpc = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(brokerKey, rpc);
  const net = await rpc.getNetwork();

  console.log("═══ 0G Compute MAINNET inference topup ═══");
  console.log(`network:  chainId=${net.chainId} rpc=${rpcUrl}`);
  console.log(`broker:   ${wallet.address}`);
  console.log(`provider: ${provider}`);
  console.log(`deposit:  ${deposit} OG`);
  console.log(`transfer: ${transferPerProvider} OG → "inference" sub-account`);
  console.log();
  if (net.chainId !== 16661n) {
    throw new Error(`expected mainnet chainId 16661, got ${net.chainId}`);
  }

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
  console.log("✅ done — mainnet runner can now spend on inference");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
