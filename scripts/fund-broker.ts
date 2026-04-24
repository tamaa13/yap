#!/usr/bin/env node
// Seeds the 0G Compute broker ledger for the server wallet.
// Usage: pnpm -F web tsx ../../scripts/fund-broker.ts [amount 0G]
//
// Reads ZG_SERVER_PRIVATE_KEY from env. Creates the ledger if missing, then
// tops it up. Idempotent — re-running increases the deposit by `amount` 0G.

import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { JsonRpcProvider, Wallet } from "ethers";

const RPC =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet"
    ? "https://evmrpc.0g.ai"
    : "https://evmrpc-testnet.0g.ai";

async function main() {
  const key = process.env.ZG_SERVER_PRIVATE_KEY;
  if (!key) {
    console.error("ZG_SERVER_PRIVATE_KEY not set");
    process.exit(1);
  }
  const amount = Number(process.argv[2] ?? 3);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("Invalid amount — pass a positive 0G value");
    process.exit(1);
  }

  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(key, provider);
  console.log(`Server wallet: ${wallet.address}`);
  const bal = await provider.getBalance(wallet.address);
  console.log(`Native balance: ${Number(bal) / 1e18} OG`);

  console.log("Initializing broker…");
  const broker = await createZGComputeNetworkBroker(wallet);

  try {
    await broker.ledger.addLedger(amount);
    console.log(`Ledger created with ${amount} OG`);
  } catch (e) {
    // Already exists — deposit on top.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("exists") || msg.toLowerCase().includes("already")) {
      await broker.ledger.depositFund(amount);
      console.log(`Deposited additional ${amount} OG`);
    } else {
      console.warn(`addLedger failed (${msg}); trying depositFund…`);
      await broker.ledger.depositFund(amount);
      console.log(`Deposited ${amount} OG`);
    }
  }

  console.log("Done. Broker ledger is hot.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
