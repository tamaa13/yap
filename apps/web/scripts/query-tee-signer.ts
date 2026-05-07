// One-shot: query the 0G Compute provider's teeSignerAddress so we can
// register it as BattleEscrow's oracleKey on deploy.
//
// Usage:
//   npx tsx scripts/query-tee-signer.ts
//
// Reads ZG_BROKER_KEY + ZG_INFERENCE_PROVIDER from .env.local. Prints the
// effective signer address (the one BattleEscrow.submitVerdict will recover
// against) plus context fields, so the deploy script's YAP_TEE_ORACLE env
// can be set deterministically.
//
// Path 1A architecture: BattleEscrow's oracleKey == this address. The
// runner pins ZG_INFERENCE_PROVIDER and the provider's enclave personal-
// signs the canonical verdict text with the key whose address is printed
// here.

import * as fs from "node:fs";
import * as path from "node:path";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";

function loadEnvLocal(): void {
  // Minimal dotenv-equivalent so we don't pull in a runtime dep just for a
  // one-shot script. Reads apps/web/.env.local from the script's parent dir.
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn(`[query-tee-signer] no .env.local at ${envPath}`);
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set in .env.local");

  const providerAddress = process.env.ZG_INFERENCE_PROVIDER;
  if (!providerAddress) {
    throw new Error("ZG_INFERENCE_PROVIDER not set in .env.local");
  }

  // Galileo testnet by default. Override with ZG_TESTNET_RPC if needed.
  const rpc =
    process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";
  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  const broker = await createZGComputeNetworkBroker(wallet);

  // Cast through unknown — listService exposes provider list with the same
  // shape used by ResponseProcessor / Verifier in the SDK. We need the full
  // svc to read teeSignerAddress + additionalInfo (TargetTeeAddress for
  // separated decentralized providers).
  const services = (await broker.inference.listService()) as unknown as Array<{
    provider: string;
    url?: string;
    model?: string;
    verifiability?: string;
    teeSignerAddress?: string;
    additionalInfo?: string;
  }>;

  const svc = services.find(
    (s) => s.provider.toLowerCase() === providerAddress.toLowerCase(),
  );
  if (!svc) {
    console.error(
      `provider ${providerAddress} not found in listService — available providers:`,
    );
    services.forEach((s) =>
      console.error(`  - ${s.provider} (model=${s.model}, url=${s.url})`),
    );
    throw new Error("provider not found");
  }

  // Resolve the actual signing address per the SDK's logic in
  // ResponseProcessor.processResponse:
  //   - separated decentralized + TargetTeeAddress set → use TargetTeeAddress
  //   - centralized OR combined → use teeSignerAddress
  let signingAddress = svc.teeSignerAddress;
  let architecture = "combined";
  if (svc.additionalInfo) {
    try {
      const info = JSON.parse(svc.additionalInfo) as {
        ProviderType?: string;
        TargetSeparated?: boolean;
        TargetTeeAddress?: string;
      };
      const providerType = info.ProviderType ?? "decentralized";
      const isCentralized = providerType === "centralized";
      if (info.TargetSeparated && !isCentralized && info.TargetTeeAddress) {
        signingAddress = info.TargetTeeAddress;
        architecture = "separated-decentralized";
      } else if (info.TargetSeparated && isCentralized) {
        architecture = "separated-centralized";
      } else {
        architecture = "combined";
      }
    } catch (e) {
      console.warn("[query-tee-signer] failed to parse additionalInfo:", e);
    }
  }

  console.log("");
  console.log("=== 0G Compute provider TEE signer ===");
  console.log(`provider:           ${svc.provider}`);
  console.log(`url:                ${svc.url}`);
  console.log(`model:              ${svc.model}`);
  console.log(`verifiability:      ${svc.verifiability}`);
  console.log(`architecture:       ${architecture}`);
  console.log(`teeSignerAddress:   ${svc.teeSignerAddress}`);
  console.log("");
  console.log(`>>> oracleKey:      ${signingAddress}`);
  console.log("");
  console.log(
    "Use the oracleKey above when deploying BattleEscrow:",
  );
  console.log("");
  console.log(`  YAP_TEE_ORACLE=${signingAddress} forge script ...`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
