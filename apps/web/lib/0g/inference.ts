// Server-only wrapper around the 0G Compute inference broker.
// Exposes `runChat({ providerAddress?, system, user, temperature? })` which
// (1) discovers a chatbot provider if none supplied,
// (2) pulls the provider's endpoint + model via broker.getServiceMetadata,
// (3) auto-funds the sub-account via broker.ledger.transferFund,
// (4) signs the request with broker.getRequestHeaders (TEE-attested billing),
// (5) POSTs an OpenAI-compatible chat completion,
// (6) hands the response back through broker.processResponse for signature
//     verification, and returns { content, signatureValid, providerAddress, chatID }.

import "server-only";
import { parseEther } from "ethers";
import { getBroker } from "./compute";

/**
 * Routing-proof attestation pulled from the provider's response-signature
 * endpoint. For separated-centralized providers (broker in TEE proxying to
 * an upstream LLM), the broker's enclave personal-signs:
 *
 *   `<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>`
 *
 * with its TEE-derived ECDSA key. Verifying on-chain proves the attestation
 * came from the registered teeSignerAddress (= our oracleKey). Binding
 * to a specific verdict requires also checking that the submitted
 * responseBody hashes to the second field of `text` and contains our
 * expected canonical YAP_VERDICT bytes — see {BattleEscrow.submitVerdict}.
 */
export interface ProviderSignature {
  /** Routing-proof text the TEE signed — colon-delimited as documented above. */
  text: string;
  /** ECDSA personal_sign over `text`, recoverable via the provider's
   *  teeSignerAddress (combined/centralized) or TargetTeeAddress (separated
   *  decentralized). */
  signature: `0x${string}`;
}

/** Result of {runCanonicalChat} — wraps {runChat}-equivalent execution but
 *  also exposes the raw HTTP response body bytes (the broker hashes those
 *  for sha256 binding) and the broker's ZG-Res-Key chat identifier (which
 *  is what the /v1/proxy/signature endpoint matches on, NOT the OpenAI
 *  completion id). */
export interface CanonicalChatResult {
  content: string;
  /** Raw HTTP response body bytes — the exact bytes whose sha256 the
   *  TEE-signed routing-proof references. Used on-chain by BattleEscrow
   *  to confirm the response wasn't tampered. */
  responseBody: Uint8Array;
  /** ZG-Res-Key header value (chat session id used by the proxy signature
   *  endpoint). */
  chatID: string;
  providerAddress: string;
  model: string;
  signatureValid: boolean;
}

/**
 * Fetch the TEE provider's signature for a previously-completed chat.
 *
 * The 0G Compute broker exposes a `/v1/proxy/signature/{chatID}?model=...`
 * endpoint that returns `{text, signature}`, where signature is an EIP-191
 * personal_sign over the response text using the enclave's TEE-derived key.
 *
 * Used by the verdict path: the runner asks the LLM to output the canonical
 * verdict text, then pulls the TEE signature here, then submits the
 * signature on-chain to BattleEscrow which verifies it recovers to the
 * registered teeSignerAddress (set as oracleKey).
 *
 * Mirrors the URL the SDK's internal Verifier.fetchSignatureByChatID hits.
 */
/**
 * Variant of {runChat} that captures the raw HTTP response body bytes and
 * the broker's ZG-Res-Key chat id, which together feed Path 1A-Hash on-chain
 * verification (sha256(responseBody) must match the routing-proof's
 * response-hash field).
 *
 * Otherwise behaves like {runChat}: discovers/uses the pinned provider,
 * funds the sub-account, posts an OpenAI-compatible chat completion, and
 * returns processResponse-validated signatureValid.
 */
export async function runCanonicalChat(
  args: RunChatArgs,
): Promise<CanonicalChatResult> {
  const broker = await getBroker();
  const providerAddress =
    args.providerAddress ?? (await pickInferenceProvider());

  await broker.inference
    .acknowledgeProviderSigner(providerAddress)
    .catch(() => {});
  await broker.ledger.depositFund(LEDGER_DEPOSIT).catch(() => {});
  await broker.ledger
    .transferFund(providerAddress, "inference", TRANSFER_PER_PROVIDER)
    .catch(() => {});

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

  // Force identity encoding all the way through: the broker hashes the raw
  // upstream response body and we need byte-equality on our side for the
  // routing-proof respSha check. Node's fetch auto-decompresses gzip
  // otherwise, breaking sha256 reconstruction.
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
  // The broker tags each chat with a UUID via the ZG-Res-Key response header
  // — that is what the /v1/proxy/signature endpoint indexes by. The OpenAI
  // completion id (`data.id`) is NOT a valid lookup key for the signature.
  const zgResKey = res.headers.get("ZG-Res-Key");
  if (!zgResKey) {
    throw new Error("0G Compute response missing ZG-Res-Key header");
  }

  // Parse the OpenAI-format JSON for the content (no escaping concerns for
  // canonical YAP_VERDICT — only ASCII characters that don't need escaping).
  const decoded = new TextDecoder().decode(responseBody);
  const data = JSON.parse(decoded) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";

  // Validate signature via SDK (broker indexes the chat for ~minutes after).
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

/**
 * Locate the byte offset where {canonical} appears as the value of the
 * `"content"` field in an OpenAI-format JSON response body. Verifies that
 * the byte before the offset and the byte after the canonical run are both
 * ASCII double-quote so the offset can be safely passed to
 * {BattleEscrow.submitVerdict}'s {contentOffset} parameter.
 *
 * Throws if the canonical text isn't found at a quote-bracketed `"content"`
 * location — e.g. the LLM mangled the format or added prose around it.
 */
export function findCanonicalContentOffset(
  responseBody: Uint8Array,
  canonical: string,
): number {
  const enc = new TextEncoder();
  const needle = enc.encode('"content":"');
  const canonicalBytes = enc.encode(canonical);
  const upper = responseBody.length - needle.length - canonicalBytes.length - 1;
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

export async function fetchProviderSignature(
  providerAddress: string,
  chatID: string,
): Promise<ProviderSignature> {
  const broker = await getBroker();
  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress,
  );
  // SDK's Verifier.fetchSignatureByChatID hits `${svc.url}/v1/proxy/signature/${chatID}`
  // where svc.url is the bare broker root (no path). getServiceMetadata returns
  // endpoint as the chat-completions root which already includes `/v1/proxy`,
  // so we strip that suffix before re-appending the signature subpath.
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

export interface RunChatArgs {
  providerAddress?: string;
  /** System-role persona / task framing. */
  system: string;
  /** User-role prompt. */
  user: string;
  /** Optional sampling temperature. Default 0.7 for creative debate, 0.2 for judge. */
  temperature?: number;
  /** Max tokens. Default 256. */
  maxTokens?: number;
}

export interface RunChatResult {
  content: string;
  signatureValid: boolean;
  providerAddress: string;
  model: string;
  chatID?: string;
}

export interface StreamChatArgs extends RunChatArgs {
  /** Called for each content delta. Server-side only. */
  onToken?: (delta: string, accumulated: string) => void;
  /** Optional AbortSignal to cancel mid-stream. */
  signal?: AbortSignal;
}

const DEFAULT_MODEL_HINT = "qwen";

/** Default ledger top-up when the wallet has no account on a provider yet. */
const LEDGER_DEPOSIT = Number(process.env.ZG_COMPUTE_LEDGER_DEPOSIT ?? 3);
const TRANSFER_PER_PROVIDER = parseEther("0.5");

/** Pick an available chatbot provider. Prefer one whose model string looks
 *  like a chat LLM (contains "qwen" or the env-configured hint). */
async function pickInferenceProvider(): Promise<string> {
  if (process.env.ZG_INFERENCE_PROVIDER) return process.env.ZG_INFERENCE_PROVIDER;
  const broker = await getBroker();
  const services = await broker.inference.listService();
  const hint = (process.env.ZG_INFERENCE_MODEL_HINT ?? DEFAULT_MODEL_HINT).toLowerCase();
  const match = services.find((s) =>
    (s.model ?? "").toLowerCase().includes(hint),
  );
  const chosen = match ?? services[0];
  if (!chosen) throw new Error("no 0G Compute inference providers available");
  return chosen.provider;
}

export async function runChat(args: RunChatArgs): Promise<RunChatResult> {
  // ───── DIAGNOSTIC INSTRUMENTATION (debug/score-persona-mainnet) ─────
  // The .catch(() => {}) wrappers below were swallowing the truth on
  // mainnet — "Sub-account not found" surfacing in the API error body
  // didn't tell us WHICH SDK call threw it. This block logs each step
  // explicitly so the next E2E cycle pinpoints whether the failure is
  // in ack / depositFund / transferFund / getServiceMetadata /
  // getRequestHeaders / the upstream fetch. Revert post-diagnosis.

  const broker = await getBroker();
  const providerAddress = args.providerAddress ?? (await pickInferenceProvider());
  // Broker wallet address — surfaces whether the ledger lookup is keyed
  // by the wallet we expect. ZGComputeNetworkBroker exposes `.signer`
  // via the ledger broker; fall back to a sentinel if the SDK version
  // doesn't expose it on this surface.
  const brokerAddr = await (async () => {
    try {
      const signer = (broker as unknown as { signer?: { getAddress?: () => Promise<string>; address?: string } }).signer;
      if (!signer) return "<no .signer on broker>";
      if (typeof signer.getAddress === "function") return await signer.getAddress();
      return signer.address ?? "<no signer.address>";
    } catch (e) {
      return `<signer probe threw: ${e instanceof Error ? e.message : e}>`;
    }
  })();
  console.warn(
    `[runChat] providerAddress arg=${args.providerAddress ?? "<undefined>"} ` +
      `envFallback=${process.env.ZG_INFERENCE_PROVIDER ?? "<unset>"} ` +
      `resolved=${providerAddress} brokerWallet=${brokerAddr}`,
  );

  // Acknowledge provider signer (idempotent — catches "already acked").
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
    console.warn(`[runChat] ack OK`);
  } catch (e) {
    console.warn(
      `[runChat] ack FAILED: ${e instanceof Error ? e.message : e}`,
    );
  }

  // Best-effort funding. Contract will surface real balance errors later.
  try {
    await broker.ledger.depositFund(LEDGER_DEPOSIT);
    console.warn(`[runChat] depositFund OK (${LEDGER_DEPOSIT})`);
  } catch (e) {
    console.warn(
      `[runChat] depositFund FAILED: ${e instanceof Error ? e.message : e}`,
    );
  }
  try {
    await broker.ledger.transferFund(
      providerAddress,
      "inference",
      TRANSFER_PER_PROVIDER,
    );
    console.warn(
      `[runChat] transferFund OK (provider=${providerAddress} amount=${TRANSFER_PER_PROVIDER.toString()})`,
    );
  } catch (e) {
    console.warn(
      `[runChat] transferFund FAILED (provider=${providerAddress}): ` +
        `${e instanceof Error ? e.message : e}`,
    );
  }

  let endpoint: string;
  let model: string;
  try {
    const meta = await broker.inference.getServiceMetadata(providerAddress);
    endpoint = meta.endpoint;
    model = meta.model;
    console.warn(`[runChat] getServiceMetadata OK endpoint=${endpoint} model=${model}`);
  } catch (e) {
    console.warn(
      `[runChat] getServiceMetadata FAILED (provider=${providerAddress}): ` +
        `${e instanceof Error ? e.message : e}`,
    );
    throw e;
  }

  // OpenAI-compatible body. Content passed to getRequestHeaders is the
  // billing-hash input — pass the full request body-ish payload for
  // deterministic signing.
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    temperature: args.temperature ?? 0.7,
    max_tokens: args.maxTokens ?? 256,
  });

  let headers: Record<string, string>;
  try {
    headers = (await broker.inference.getRequestHeaders(
      providerAddress,
      body,
    )) as unknown as Record<string, string>;
    console.warn(
      `[runChat] getRequestHeaders OK (${Object.keys(headers).length} headers)`,
    );
  } catch (e) {
    console.warn(
      `[runChat] getRequestHeaders FAILED (provider=${providerAddress}): ` +
        `${e instanceof Error ? e.message : e}`,
    );
    throw e;
  }

  console.warn(`[runChat] about to POST ${endpoint}/chat/completions model=${model}`);
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-encoding": "identity",
      ...headers,
    },
    body,
  });
  console.warn(`[runChat] POST returned status=${res.status}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[runChat] POST !ok body[:200]=${text.slice(0, 200)}`);
    throw new Error(`0G Compute inference HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  // ZG-Res-Key is the broker's chat session id used by /v1/proxy/signature;
  // the OpenAI completion id (`data.id`) is NOT a valid signature lookup key.
  // Fall back to data.id only if the header is missing (older brokers).
  const zgResKey = res.headers.get("ZG-Res-Key");
  const data = (await res.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const chatID = zgResKey ?? data.id;

  // TEE signature verification. `processResponse` returns:
  //   true  → service is verifiable AND signature valid
  //   false → service is verifiable BUT signature invalid
  //   null  → service is non-verifiable (no attestation envelope)
  // Brief: "verifiable AI" requires actual cryptographic verification, so this
  // is fail-CLOSED: only treat as valid when explicitly verified true. Both
  // `null` (no envelope) and SDK/network errors collapse to invalid.
  let signatureValid = false;
  try {
    const sigCheck = await broker.inference.processResponse(
      providerAddress,
      chatID,
      content,
    );
    signatureValid = sigCheck === true;
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

/**
 * Streaming variant: opens an OpenAI-compatible `stream: true` request to
 * the 0G Compute provider and invokes {onToken} per content delta. Returns
 * the full accumulated content once the stream ends.
 *
 * Handles the `data: {...}\n\n` SSE frame format emitted by OpenAI-compat
 * endpoints. Stops on the literal `data: [DONE]` sentinel. Parses partial
 * JSON frames buffered across chunk boundaries.
 */
export async function streamChat(args: StreamChatArgs): Promise<RunChatResult> {
  const broker = await getBroker();
  const providerAddress = args.providerAddress ?? (await pickInferenceProvider());

  await broker.inference
    .acknowledgeProviderSigner(providerAddress)
    .catch(() => {});
  await broker.ledger.depositFund(LEDGER_DEPOSIT).catch(() => {});
  await broker.ledger
    .transferFund(providerAddress, "inference", TRANSFER_PER_PROVIDER)
    .catch(() => {});

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
    stream: true,
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
      accept: "text/event-stream",
      ...headers,
    },
    body,
    signal: args.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `0G Compute stream HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  // ZG-Res-Key is the broker's chat session id used by /v1/proxy/signature;
  // the OpenAI completion id is NOT a valid signature lookup key. Capture it
  // before reading the SSE body since headers are available immediately.
  const zgResKey = res.headers.get("ZG-Res-Key") ?? undefined;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let chatID: string | undefined = zgResKey;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE frames separated by "\n\n".
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        // Each frame can have multiple `data:` lines; OpenAI-compat uses 1.
        for (const line of frame.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            // Final sentinel — upstream signals completion.
            continue;
          }
          try {
            const json = JSON.parse(payload) as {
              id?: string;
              choices?: Array<{ delta?: { content?: string } }>;
            };
            // Only fall back to OpenAI completion id when no ZG-Res-Key was
            // received — keeps signature lookup keyed correctly when the
            // broker sets the header (current 0G provider).
            if (!chatID && json.id) chatID = json.id;
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              content += delta;
              args.onToken?.(delta, content);
            }
          } catch {
            // Malformed JSON frame — skip. Upstream sometimes emits heartbeats.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Verify TEE signature using accumulated content + chat ID.
  // Fail-CLOSED: only true when explicitly verified. See runChat() for rationale.
  let signatureValid = false;
  try {
    const sigCheck = await broker.inference.processResponse(
      providerAddress,
      chatID,
      content,
    );
    signatureValid = sigCheck === true;
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
