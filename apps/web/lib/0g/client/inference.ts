"use client";

// Browser-side port of `lib/0g/inference.ts`. Same wire protocol +
// canonical-echo + signature-fetch surface, but the broker is supplied
// by the caller (built from the user's wallet via
// `lib/0g/client/compute.ts:createUserBroker`) instead of derived from
// a server env key. Funding txs run through the user's wallet so the
// economic load shifts off the server broker EOA.
//
// Opsi B (2026-05-13) — see ARCHITECTURE.

import { parseEther } from "ethers";
import type { ZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

export interface ProviderSignature {
  text: string;
  signature: `0x${string}`;
}

export interface CanonicalChatResult {
  content: string;
  responseBody: Uint8Array;
  chatID: string;
  providerAddress: string;
  model: string;
  signatureValid: boolean;
}

export interface RunChatArgs {
  providerAddress?: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface RunChatResult {
  content: string;
  signatureValid: boolean;
  providerAddress: string;
  model: string;
  chatID?: string;
}

const DEFAULT_MODEL_HINT = "qwen";

/** Client-side LEDGER_DEPOSIT default. Mainnet env can pin this via
 *  `NEXT_PUBLIC_ZG_COMPUTE_LEDGER_DEPOSIT`. Hard-floored at 3 because
 *  the ledger contract rejects depositFund < 3 OG on FIRST deposit
 *  (account creation). A misconfigured 0.5 env would otherwise
 *  silently break every fresh-wallet mint. Subsequent top-ups can be
 *  any amount, but 3 is fine — over-funding refills isn't a footgun.
 *  Ref: @0gfoundation/0g-compute-ts-sdk ledger/broker.ts:175. */
const LEDGER_DEPOSIT = Math.max(
  3,
  Number(process.env.NEXT_PUBLIC_ZG_COMPUTE_LEDGER_DEPOSIT ?? 3),
);
const TRANSFER_PER_PROVIDER = parseEther("0.5");

const LEDGER_REFILL_BELOW = parseEther("0.6");
const SUBACCOUNT_REFILL_BELOW = parseEther("0.1");

/** Same shape as the server pickInferenceProvider but pulls from
 *  NEXT_PUBLIC_* envs so the value is baked into the client bundle.
 *  The model hint is matched case-insensitively against the SDK's
 *  service catalogue; missing → first service. */
export async function pickInferenceProvider(
  broker: ZGComputeNetworkBroker,
): Promise<string> {
  if (process.env.NEXT_PUBLIC_ZG_INFERENCE_PROVIDER) {
    return process.env.NEXT_PUBLIC_ZG_INFERENCE_PROVIDER;
  }
  const services = await broker.inference.listService();
  const hint = (
    process.env.NEXT_PUBLIC_ZG_INFERENCE_MODEL_HINT ?? DEFAULT_MODEL_HINT
  ).toLowerCase();
  const match = services.find((s) =>
    (s.model ?? "").toLowerCase().includes(hint),
  );
  const chosen = match ?? services[0];
  if (!chosen) throw new Error("no 0G Compute inference providers available");
  return chosen.provider;
}

/**
 * Read-first conditional auto-fund. Verbatim port of the server-side
 * `ensureFunded` — same thresholds, same fail-open posture. The
 * difference: txs are signed by the user's wallet, so the user sees
 * the deposit / transfer prompts in their wallet UI the first time
 * either branch fires. The state-machine hook gates the explicit-prompt
 * UX BEFORE this function gets called, so the within-runChat fallback
 * is a paranoia rail (catches the case where the user's sub-account
 * drains mid-cycle).
 */
export async function ensureFunded(
  broker: ZGComputeNetworkBroker,
  providerAddress: string,
): Promise<void> {
  try {
    const ledger = await broker.ledger.getLedger();
    if (ledger.availableBalance < LEDGER_REFILL_BELOW) {
      try {
        await broker.ledger.depositFund(LEDGER_DEPOSIT);
      } catch (e) {
        console.warn(
          `[ensureFunded:client] depositFund failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  } catch (e) {
    console.warn(
      `[ensureFunded:client] getLedger probe failed (skipping deposit): ${e instanceof Error ? e.message : e}`,
    );
  }

  try {
    const account = await broker.inference.getAccount(providerAddress);
    const pendingRefund = account.pendingRefund ?? 0n;
    const spendable = account.balance - pendingRefund;
    if (spendable < SUBACCOUNT_REFILL_BELOW) {
      try {
        await broker.ledger.transferFund(
          providerAddress,
          "inference",
          TRANSFER_PER_PROVIDER,
        );
      } catch (e) {
        console.warn(
          `[ensureFunded:client] transferFund failed (provider=${providerAddress}): ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  } catch (e) {
    console.warn(
      `[ensureFunded:client] getAccount probe failed (bootstrapping with one transferFund): ${e instanceof Error ? e.message : e}`,
    );
    try {
      await broker.ledger.transferFund(
        providerAddress,
        "inference",
        TRANSFER_PER_PROVIDER,
      );
    } catch (bootstrapErr) {
      console.warn(
        `[ensureFunded:client] bootstrap transferFund failed (provider=${providerAddress}): ${bootstrapErr instanceof Error ? bootstrapErr.message : bootstrapErr}`,
      );
    }
  }
}

/** One-shot chat completion. Mirrors `lib/0g/inference.ts:runChat`
 *  except the broker is supplied by the caller. */
export async function runChat(
  broker: ZGComputeNetworkBroker,
  args: RunChatArgs,
): Promise<RunChatResult> {
  const providerAddress =
    args.providerAddress ?? (await pickInferenceProvider(broker));

  await broker.inference
    .acknowledgeProviderSigner(providerAddress)
    .catch(() => {});
  await ensureFunded(broker, providerAddress);

  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress,
  );

  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    temperature: args.temperature ?? 0.7,
    max_tokens: args.maxTokens ?? 256,
  });

  const headers = (await broker.inference.getRequestHeaders(
    providerAddress,
    body,
  )) as unknown as Record<string, string>;

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // accept-encoding identity: see server module for the
      // sha256(responseBody) byte-equality rationale. Browser fetch
      // honors this header (no auto-decompress mismatch in modern
      // engines), but pinned for parity with the runner.
      "accept-encoding": "identity",
      ...headers,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `0G Compute inference HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  const zgResKey = res.headers.get("ZG-Res-Key");
  const data = (await res.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const chatID = zgResKey ?? data.id;

  let signatureValid = false;
  try {
    if (chatID) {
      const sigCheck = await broker.inference.processResponse(
        providerAddress,
        chatID,
        content,
      );
      signatureValid = sigCheck === true;
    }
  } catch {
    signatureValid = false;
  }

  return {
    content,
    signatureValid,
    providerAddress,
    model,
    chatID,
  };
}

/** Canonical-echo variant. Captures raw response bytes + ZG-Res-Key so
 *  the on-chain verifier can re-check sha256(responseBody). */
export async function runCanonicalChat(
  broker: ZGComputeNetworkBroker,
  args: RunChatArgs,
): Promise<CanonicalChatResult> {
  const providerAddress =
    args.providerAddress ?? (await pickInferenceProvider(broker));

  await broker.inference
    .acknowledgeProviderSigner(providerAddress)
    .catch(() => {});
  await ensureFunded(broker, providerAddress);

  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress,
  );
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    temperature: args.temperature ?? 0,
    max_tokens: args.maxTokens ?? 256,
  });
  const headers = (await broker.inference.getRequestHeaders(
    providerAddress,
    body,
  )) as unknown as Record<string, string>;

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-encoding": "identity",
      ...headers,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `0G Compute inference HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  const responseBody = new Uint8Array(await res.arrayBuffer());
  const zgResKey = res.headers.get("ZG-Res-Key");
  if (!zgResKey) {
    throw new Error("0G Compute response missing ZG-Res-Key header");
  }

  const decoded = new TextDecoder().decode(responseBody);
  const data = JSON.parse(decoded) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";

  let signatureValid = false;
  try {
    const sigCheck = await broker.inference.processResponse(
      providerAddress,
      zgResKey,
      content,
    );
    signatureValid = sigCheck === true;
  } catch {
    signatureValid = false;
  }

  return {
    content,
    responseBody,
    chatID: zgResKey,
    providerAddress,
    model,
    signatureValid,
  };
}

/** Same byte-walker as the server module's `findCanonicalContentOffset`
 *  — bytes are bytes, no client-specific changes needed. Re-exported
 *  here so the client modules don't reach across the server boundary. */
export function findCanonicalContentOffset(
  responseBody: Uint8Array,
  canonical: string,
): number {
  const enc = new TextEncoder();
  const needle = enc.encode('"content":"');
  const canonicalBytes = enc.encode(canonical);
  const upper =
    responseBody.length - needle.length - canonicalBytes.length - 1;
  outer: for (let i = 0; i <= upper; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (responseBody[i + j] !== needle[j]) continue outer;
    }
    const offset = i + needle.length;
    for (let j = 0; j < canonicalBytes.length; j++) {
      if (responseBody[offset + j] !== canonicalBytes[j]) continue outer;
    }
    if (responseBody[offset + canonicalBytes.length] !== 0x22 /* '"' */) {
      continue outer;
    }
    return offset;
  }
  throw new Error("canonical text not found inside response body content");
}

/** Pull the TEE provider's routing-proof signature for a completed
 *  chat. Same URL-stripping logic as the server module so the
 *  /v1/proxy/signature/{chatID} path resolves correctly across both
 *  the testnet and mainnet broker base URLs. */
export async function fetchProviderSignature(
  broker: ZGComputeNetworkBroker,
  providerAddress: string,
  chatID: string,
): Promise<ProviderSignature> {
  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress,
  );
  const base = endpoint
    .replace(/\/+$/, "")
    .replace(/\/v1\/proxy\/?$/, "")
    .replace(/\/v1\/?$/, "");
  const url = `${base}/v1/proxy/signature/${encodeURIComponent(chatID)}?model=${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `0G Compute signature fetch HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { text?: string; signature?: string };
  if (!data.text || !data.signature) {
    throw new Error("0G Compute signature response missing text or signature");
  }
  return {
    text: data.text,
    signature: data.signature as `0x${string}`,
  };
}
