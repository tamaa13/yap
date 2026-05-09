import { JsonRpcProvider, Wallet } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

async function main() {
  const wallet = new Wallet(process.env.PK!, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  const broker = await createZGComputeNetworkBroker(wallet);
  const lb = broker.ledger as any;
  console.log("broker.ledger keys:", Object.keys(lb));
  console.log("broker.ledger.ledger keys:", Object.keys(lb.ledger ?? {}));
  console.log("broker.ledger.ledger.ledgerContract keys:", Object.keys(lb.ledger?.ledgerContract ?? {}));
  const lc = lb.ledger?.ledgerContract;
  if (lc) {
    console.log("ledgerContract.ledger:", typeof lc.ledger, lc.ledger?.target ?? lc.ledger?.address);
    console.log("ledgerContract.serving:", typeof lc.serving);
    console.log("ledgerContract.signer:", typeof lc.signer);
    if (lc.ledger && typeof lc.ledger.addLedger === "function") {
      console.log("ledgerContract.ledger.addLedger is a function");
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
