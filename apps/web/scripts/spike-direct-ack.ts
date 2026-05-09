// Test hypothesis: direct contract.acknowledgeDeliverable bypass TEE download.
// If 609a7752 not yet settled, ack should succeed → unlock queue → re-fine-tune works.
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

async function main() {
  const wallet = new Wallet(process.env.PK!, new JsonRpcProvider("https://evmrpc-testnet.0g.ai"));
  console.log("wallet:", wallet.address);

  const broker = await createZGComputeNetworkBroker(wallet);
  if (!broker.fineTuning) throw new Error("no fineTuning");

  const provider = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
  const taskId = "609a7752-72aa-404b-a621-2e3ecc8c96fb";

  const ft = broker.fineTuning as any;

  console.log("\n=== Step 1: getDeliverable (check settled state) ===");
  const d = await ft.modelProcessor.contract.getDeliverable(provider, taskId);
  console.log("  id          :", d[0]);
  console.log("  acknowledged:", d[3]);
  console.log("  timestamp   :", d[4].toString());
  console.log("  settled     :", d[5]);

  if (d[3] === true) {
    console.log("\n  → already acked, queue clean");
    return;
  }
  if (d[5] === true) {
    console.log("\n  → already SETTLED → CannotAcknowledgeSettledDeliverable expected. Bug #6 hit.");
    return;
  }

  console.log("\n=== Step 2: direct acknowledgeDeliverable (bypass TEE download) ===");
  try {
    await ft.modelProcessor.contract.acknowledgeDeliverable(provider, taskId);
    console.log("  ✓ ACK SUCCESS — Bug #7 fully bypassable client-side!");
  } catch (e) {
    console.error("  ✗ ack err:", e instanceof Error ? e.message : e);
    return;
  }

  console.log("\n=== Step 3: re-check deliverable state ===");
  const d2 = await ft.modelProcessor.contract.getDeliverable(provider, taskId);
  console.log("  acknowledged:", d2[3], d2[3] === true ? "✓" : "✗");
  console.log("  settled     :", d2[5]);

  console.log("\n=== Step 4: createTask AGAIN on same wallet (queue should be clean) ===");
  // Re-fund sub if needed
  await broker.fineTuning.acknowledgeProviderSigner(provider).catch(() => {});
  await broker.ledger.transferFund(provider, "fine-tuning", parseEther("0.05")).catch(e => {
    console.warn("  transfer:", e instanceof Error ? e.message : e);
  });

  const params = {
    neftune_noise_alpha: 5, num_train_epochs: 1, per_device_train_batch_size: 1,
    learning_rate: 0.0002, max_steps: 1,
  };
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const paramsPath = path.join(os.tmpdir(), `direct-ack-${Date.now()}.json`);
  fs.writeFileSync(paramsPath, JSON.stringify(params));

  try {
    const newTaskId = await broker.fineTuning.createTask(
      provider, "Qwen2.5-0.5B-Instruct",
      "0xf83f617831aab14355c4abe5c509db7753f8269a343e0a072fcc0f0b82f74806",
      paramsPath,
    );
    console.log("  ✓ NEW TASK ACCEPTED:", newTaskId);
    console.log("\n  💡 PROOF: 1 wallet → multiple fine-tunes via direct ack pattern");
  } catch (e) {
    console.error("  ✗ createTask err:", e instanceof Error ? e.message : e);
  } finally {
    fs.unlinkSync(paramsPath);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
