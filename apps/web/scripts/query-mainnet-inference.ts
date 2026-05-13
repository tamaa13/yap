// One-shot: enumerate 0G Compute inference providers on Aristotle mainnet
// and pick the one running qwen3.6-plus. Mirrors query-tee-signer.ts but
// hits the mainnet broker (RPC https://evmrpc.0g.ai by default) and lists
// every service rather than looking up a single pinned provider.
//
// Usage:
//   pnpm --filter web tsx scripts/query-mainnet-inference.ts
//
// Reads ZG_BROKER_KEY from apps/web/.env.local. Doesn't read
// ZG_INFERENCE_PROVIDER (we're discovering, not confirming). Prints a
// table-ish summary so the deploy ceremony's YAP_TEE_ORACLE +
// ZG_INFERENCE_PROVIDER can be picked deterministically.

import * as fs from "node:fs";
import * as path from "node:path";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn(`[query-mainnet] no .env.local at ${envPath}`);
    return;
  }
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

function resolveSigner(svc: {
  teeSignerAddress?: string;
  additionalInfo?: string;
}): { signer: string; architecture: string } {
  let signer = svc.teeSignerAddress ?? "";
  let architecture = "combined";
  if (svc.additionalInfo) {
    try {
      const info = JSON.parse(svc.additionalInfo) as {
        ProviderType?: string;
        TargetSeparated?: boolean;
        TargetTeeAddress?: string;
      };
      const isCentralized = info.ProviderType === "centralized";
      if (info.TargetSeparated && !isCentralized && info.TargetTeeAddress) {
        signer = info.TargetTeeAddress;
        architecture = "separated-decentralized";
      } else if (info.TargetSeparated && isCentralized) {
        architecture = "separated-centralized";
      } else {
        architecture = "combined";
      }
    } catch {}
  }
  return { signer, architecture };
}

async function main(): Promise<void> {
  loadEnvLocal();

  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set in .env.local");

  const rpc = process.env.ZG_MAINNET_RPC ?? "https://evmrpc.0g.ai";
  const provider = new JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  console.log(`network: chainId=${net.chainId} rpc=${rpc}`);
  if (net.chainId !== 16661n) {
    console.warn(`!! chainId ${net.chainId} is not Aristotle (16661)`);
  }
  const wallet = new Wallet(pk, provider);
  console.log(`broker:  ${wallet.address}`);

  const broker = await createZGComputeNetworkBroker(wallet);

  const services = (await broker.inference.listService()) as unknown as Array<{
    provider: string;
    url?: string;
    model?: string;
    verifiability?: string;
    teeSignerAddress?: string;
    additionalInfo?: string;
  }>;

  console.log(`\nTotal inference services: ${services.length}\n`);

  const filter = (process.argv[2] ?? "").toLowerCase();
  const rows = services.map((s) => {
    const { signer, architecture } = resolveSigner(s);
    return {
      provider: s.provider,
      model: s.model ?? "",
      url: s.url ?? "",
      verifiability: s.verifiability ?? "",
      architecture,
      teeSigner: signer,
    };
  });

  for (const r of rows) {
    const match = filter && r.model.toLowerCase().includes(filter);
    const prefix = match ? "★" : " ";
    console.log(`${prefix} ${r.model.padEnd(28)} ${r.architecture.padEnd(24)} ${r.provider}`);
    console.log(`    teeSigner: ${r.teeSigner}`);
    console.log(`    url:       ${r.url}`);
    console.log(`    verifiability: ${r.verifiability}`);
    console.log("");
  }

  if (filter) {
    const matches = rows.filter((r) => r.model.toLowerCase().includes(filter));
    if (matches.length === 0) {
      console.log(`No model matches "${filter}". Pick from the list above.`);
    } else {
      console.log(`\n=== Matches for "${filter}" ===`);
      for (const m of matches) {
        console.log("");
        console.log(`model:    ${m.model}`);
        console.log(`provider: ${m.provider}    (ZG_INFERENCE_PROVIDER)`);
        console.log(`teeSigner:${m.teeSigner}    (YAP_TEE_ORACLE + YAP_SCORE_ORACLE)`);
        console.log(`arch:     ${m.architecture}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
