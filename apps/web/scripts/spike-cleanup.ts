import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

async function main() {
  const wallet = new Wallet(process.env.PK!, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no ft");
  const ft = broker.fineTuning as any;

  const PROVIDER = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
  const TASK = "1a789db0-0c48-4b87-8d3a-e05b194a344c";

  const balBefore = await wallet.provider!.getBalance(wallet.address);
  console.log("EOA before:", formatEther(balBefore));

  console.log("\n→ polling task to Delivered…");
  const deadline = Date.now() + 25 * 60_000;
  let lastP = "";
  while (Date.now() < deadline) {
    const t = await broker.fineTuning.getTask(PROVIDER, TASK);
    const p = (t.progress ?? "").toLowerCase().trim();
    if (p !== lastP) { console.log(`  ${new Date().toISOString().slice(11,19)} ${t.progress}`); lastP = p; }
    if (["finished","done","delivered"].includes(p)) break;
    if (["failed","cancelled","canceled","error"].includes(p)) {
      console.error("  task failed");
      try { console.error("log:", await broker.fineTuning.getLog(PROVIDER, TASK)); } catch {}
      return;
    }
    await new Promise(r => setTimeout(r, 8000));
  }

  console.log("\n→ direct ack…");
  await ft.modelProcessor.contract.acknowledgeDeliverable(PROVIDER, TASK);
  const d = await ft.modelProcessor.contract.getDeliverable(PROVIDER, TASK);
  console.log(`  ack=${d[3]} settled=${d[5]}`);

  const balAfter = await wallet.provider!.getBalance(wallet.address);
  console.log("\nEOA after:", formatEther(balAfter), `(burned ${formatEther(balBefore - balAfter)})`);

  try {
    const lg = await broker.ledger.getLedger();
    console.log("ledger total:", formatEther(lg.totalBalance ?? 0n));
  } catch {}

  console.log("\n✓ wallet clean. Settle akan fire ~10 menit kemudian.");
}
main().catch(e => { console.error(e); process.exit(1); });
