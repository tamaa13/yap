import { JsonRpcProvider, Wallet } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

async function main() {
  const wallet = new Wallet(process.env.PK!, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  const broker = await createZGComputeNetworkBroker(wallet);
  const ft = broker.fineTuning as any;
  const PROVIDER = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
  const TASK = "ea6a3581-06c8-4a25-a8d0-bea937b77127";

  console.log("watching ea6a3581 settle status…");
  const start = Date.now();
  let lastState = "";
  for (let i = 0; i < 60; i++) {
    const d = await ft.modelProcessor.contract.getDeliverable(PROVIDER, TASK);
    const state = `ack=${d[3]} settled=${d[5]}`;
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    if (state !== lastState) {
      console.log(`  +${elapsed}s ${state}`);
      lastState = state;
      if (d[5] === true) { console.log("  ✓ settled flipped"); break; }
    } else if (i % 6 === 0) {
      console.log(`  +${elapsed}s (no change)`);
    }
    await new Promise(r => setTimeout(r, 10_000));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
