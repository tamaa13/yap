import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

async function main() {
  const wallet = new Wallet(process.env.PK!, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no ft");

  const PROVIDER = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";

  console.log("=== createTask now (post-settle) ===");
  await broker.ledger.transferFund(PROVIDER, "fine-tuning", parseEther("0.05")).catch((e: any) => console.warn(e?.message));

  const params = { neftune_noise_alpha: 5, num_train_epochs: 1, per_device_train_batch_size: 1, learning_rate: 0.0002, max_steps: 1 };
  const paramsPath = path.join(os.tmpdir(), `confirm-${Date.now()}.json`);
  fs.writeFileSync(paramsPath, JSON.stringify(params));

  try {
    const taskId = await broker.fineTuning.createTask(PROVIDER, "Qwen2.5-0.5B-Instruct",
      "0xf83f617831aab14355c4abe5c509db7753f8269a343e0a072fcc0f0b82f74806", paramsPath);
    console.log("✓ NEW TASK ACCEPTED:", taskId);
    console.log("\nConfirm: 1 wallet → unlimited fine-tunes works (with settle wait)");
  } catch (e) {
    console.error("✗ createTask:", e instanceof Error ? e.message : e);
  } finally {
    fs.unlinkSync(paramsPath);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
