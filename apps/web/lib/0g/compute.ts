// Server-only wrapper around the 0G Compute broker.
// Exposes a lazily-initialized broker + a convenience inference helper that a
// Next.js route handler can call.
//
// Fine-tune helper was dropped 2026-05-09 (Phase 2 pivot — see ARCHITECTURE.md):
// the LoRA produced inside the TEE was never re-loaded into battle inference,
// so the on-chain attestation chain (sealed key + metadataHash) carries the
// only guarantee the consumer needs. Battle inference runs against the base
// model regardless.

import "server-only";
// Force the SDK through Node's CJS loader. The ESM bundle inlines its own
// `eciesjs` + `@noble/curves`; under bundled validation the ECIES public-key
// extraction in `decryptModel` rejects valid ciphertext with
// "second arg must be public key". The CJS build keeps both deps external,
// so the ECIES path matches the version we and the rest of the runtime use.
import type {
  createZGComputeNetworkBroker as CreateBrokerFn,
  ZGComputeNetworkBroker,
} from "@0gfoundation/0g-compute-ts-sdk";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createZGComputeNetworkBroker } = require("@0gfoundation/0g-compute-ts-sdk") as {
  createZGComputeNetworkBroker: typeof CreateBrokerFn;
};
import { JsonRpcProvider, Wallet } from "ethers";
import { activeChain } from "@/lib/chains";

const RPC = activeChain.rpcUrls.default.http[0];

let cached: ZGComputeNetworkBroker | null = null;

export async function getBroker(): Promise<ZGComputeNetworkBroker> {
  if (cached) return cached;
  // Broker funds 0G Compute (inference) ledger and pays Storage submission gas.
  // Isolated from the verdict relayer key so a leak here only exposes Compute
  // spend, not on-chain verdict submission.
  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set");
  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(pk, provider);
  cached = await createZGComputeNetworkBroker(wallet);
  return cached;
}

export interface InferenceCall {
  providerAddress: string;
  model: string;
  prompt: string;
}

export interface InferenceResult {
  text: string;
  signatureValid: boolean;
  providerAddress: string;
  chatID?: string;
}

/**
 * Run a single chat completion against a 0G Compute provider. Uses
 * getRequestHeaders → fetch → processResponse to honor the TEE billing +
 * signature verification pipeline.
 */
export async function runInference(call: InferenceCall): Promise<InferenceResult> {
  const broker = await getBroker();
  await broker.inference.acknowledgeProviderSigner(call.providerAddress).catch(() => {});

  const headers = await broker.inference.getRequestHeaders(
    call.providerAddress,
    call.prompt,
  );

  // Provider endpoint URL is not exposed directly by the broker in all SDK
  // versions; many deployments embed it in the service metadata. Consumers
  // should pass an explicit base URL via env. For the hackathon flow we rely
  // on a well-known env var.
  const baseUrl = process.env.ZG_COMPUTE_PROVIDER_URL;
  if (!baseUrl) {
    throw new Error("ZG_COMPUTE_PROVIDER_URL not set (per-provider base URL)");
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers as unknown as Record<string, string>),
    },
    body: JSON.stringify({
      model: call.model,
      messages: [{ role: "user", content: call.prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`inference HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    id?: string;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  // TEE signature verification can fail provider-side (e.g. a separated-centralized
  // provider whose signer service is down). Don't drop the already-generated text —
  // return it with signatureValid=false. Auto-recovers to true once the signer is healthy.
  let signatureValid = false;
  try {
    signatureValid =
      (await broker.inference.processResponse(call.providerAddress, data.id, text)) ??
      false;
  } catch (e) {
    console.warn(
      "[compute] signature verification failed (returning text unverified):",
      e instanceof Error ? e.message : e,
    );
  }

  return {
    text,
    signatureValid,
    providerAddress: call.providerAddress,
    chatID: data.id,
  };
}
