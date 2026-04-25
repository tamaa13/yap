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
  const broker = await getBroker();
  const providerAddress = args.providerAddress ?? (await pickInferenceProvider());

  // Acknowledge provider signer (idempotent — catches "already acked").
  await broker.inference
    .acknowledgeProviderSigner(providerAddress)
    .catch(() => {});

  // Best-effort funding. Contract will surface real balance errors later.
  await broker.ledger.depositFund(LEDGER_DEPOSIT).catch(() => {});
  await broker.ledger
    .transferFund(providerAddress, "inference", TRANSFER_PER_PROVIDER)
    .catch(() => {});

  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress,
  );

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

  const headers = (await broker.inference.getRequestHeaders(
    providerAddress,
    body,
  )) as unknown as Record<string, string>;

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`0G Compute inference HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const chatID = data.id;

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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let chatID: string | undefined;

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
            if (json.id && !chatID) chatID = json.id;
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
