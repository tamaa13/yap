// Path 1A-Hash spike — validates the full routing-proof verification flow
// end-to-end without spinning up a real battle.
//
// Steps:
//   1. Pick the pinned 0G Compute provider, query its teeSignerAddress,
//      confirm it matches the deployed BattleEscrow.oracleKey.
//   2. Build the canonical YAP_VERDICT text using a fake battleId/verdictHash.
//   3. Issue a chat completion asking the LLM to echo canonical exactly,
//      capture raw responseBody bytes + ZG-Res-Key chat id.
//   4. Fetch the routing-proof signature via SDK's Verifier.fetchSignatureByChatID.
//   5. Verify locally:
//        - ECDSA recovers to oracleKey
//        - sha256(responseBody) matches the respSha field of signedText
//        - canonical bytes appear at the computed contentOffset in responseBody
//        - on-chain BattleEscrow.teeSignedTextDigest matches the local digest
//   6. Print SUCCESS if all checks pass; failures pinpoint exactly where the
//      mismatch is so we can iterate the prompt or contract logic.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  hashMessage,
  recoverAddress,
  keccak256,
  toUtf8Bytes,
  sha256,
  hexlify,
  parseEther,
} from "ethers";
import {
  createZGComputeNetworkBroker,
  InferenceVerifier,
} from "@0gfoundation/0g-compute-ts-sdk";

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
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

function check(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const pk = process.env.ZG_BROKER_KEY;
  if (!pk) throw new Error("ZG_BROKER_KEY not set");
  const providerAddress = process.env.ZG_INFERENCE_PROVIDER;
  if (!providerAddress) throw new Error("ZG_INFERENCE_PROVIDER not set");
  const escrowAddr = process.env.NEXT_PUBLIC_BATTLE_ESCROW_ADDR_TESTNET;
  if (!escrowAddr) throw new Error("BATTLE_ESCROW_ADDR_TESTNET not set");
  const rpc = process.env.ZG_TESTNET_RPC ?? "https://evmrpc-testnet.0g.ai";
  const chainId = 16602;

  const wallet = new Wallet(pk, new JsonRpcProvider(rpc));
  const broker = await createZGComputeNetworkBroker(wallet);

  // ─── Resolve provider's signing address ──────────────────────────────
  const services = (await broker.inference.listService()) as unknown as Array<{
    provider: string;
    url?: string;
    model?: string;
    teeSignerAddress?: string;
    additionalInfo?: string;
  }>;
  const svc = services.find(
    (s) => s.provider.toLowerCase() === providerAddress.toLowerCase(),
  );
  if (!svc) throw new Error("provider not found in listService");

  let signingAddress = svc.teeSignerAddress;
  if (svc.additionalInfo) {
    try {
      const info = JSON.parse(svc.additionalInfo) as {
        ProviderType?: string;
        TargetSeparated?: boolean;
        TargetTeeAddress?: string;
      };
      const isCentralized = info.ProviderType === "centralized";
      if (info.TargetSeparated && !isCentralized && info.TargetTeeAddress) {
        signingAddress = info.TargetTeeAddress;
      }
    } catch {}
  }
  if (!signingAddress) throw new Error("no signingAddress for provider");

  // ─── Confirm on-chain oracleKey matches ──────────────────────────────
  const escrowAbi = [
    "function oracleKey() external view returns (address)",
    "function verdictCanonicalText(uint256,uint8,bytes32) external view returns (string)",
    "function teeSignedTextDigest(bytes calldata) external pure returns (bytes32)",
  ];
  const escrow = new Contract(
    escrowAddr,
    escrowAbi,
    new JsonRpcProvider(rpc),
  );
  const onchainOracleKey = (await escrow.oracleKey()) as string;
  console.log("provider:        ", svc.provider);
  console.log("model:           ", svc.model);
  console.log("svc.url:         ", svc.url);
  console.log("teeSignerAddress:", signingAddress);
  console.log("escrow.oracleKey:", onchainOracleKey);
  console.log("");
  check(
    "oracleKey on-chain == provider TEE signer",
    onchainOracleKey.toLowerCase() === signingAddress.toLowerCase(),
  );

  // ─── Build canonical text via on-chain view ──────────────────────────
  const battleId = 999;
  const winner = 0;
  const verdictHash = keccak256(
    toUtf8Bytes("path-1a-hash spike transcript"),
  );
  const onchainCanonical = (await escrow.verdictCanonicalText(
    battleId,
    winner,
    verdictHash,
  )) as string;
  console.log("canonical text (on-chain):");
  console.log(`  ${onchainCanonical}`);
  console.log("");

  // ─── Issue chat completion (ask LLM to echo canonical exactly) ───────
  console.log("acknowledging provider + funding ledger…");
  await broker.inference.acknowledgeProviderSigner(providerAddress).catch(() => {});
  await broker.ledger.depositFund(0.5).catch(() => {});
  await broker.ledger
    .transferFund(providerAddress, "inference", parseEther("0.1"))
    .catch(() => {});

  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress,
  );
  const reqBody = JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a deterministic transcription tool. Echo the user's text exactly, character-for-character. Output a single line. No prose, no preamble, no postscript, no markdown, no quotes, no extra whitespace.",
      },
      { role: "user", content: onchainCanonical },
    ],
    temperature: 0,
    max_tokens: 256,
  });
  const headers = (await broker.inference.getRequestHeaders(
    providerAddress,
    reqBody,
  )) as unknown as Record<string, string>;

  console.log("posting chat completion…");
  // Force identity encoding all the way through so the bytes the broker
  // hashes (raw upstream body) match the bytes we receive — Node's fetch
  // auto-decompresses gzip otherwise, breaking sha256 reconstruction.
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-encoding": "identity",
      ...headers,
    },
    body: reqBody,
  });
  if (!res.ok) {
    throw new Error(
      `inference HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const responseBody = new Uint8Array(await res.arrayBuffer());
  const zgResKey = res.headers.get("ZG-Res-Key");
  if (!zgResKey) throw new Error("no ZG-Res-Key header");
  const decoded = new TextDecoder().decode(responseBody);
  const json = JSON.parse(decoded) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const llmContent = json.choices?.[0]?.message?.content ?? "";
  console.log("LLM content:");
  console.log(`  ${JSON.stringify(llmContent)}`);
  console.log("ZG-Res-Key:       ", zgResKey);
  console.log("responseBody.len: ", responseBody.length);
  console.log("");

  check("LLM echo matches canonical", llmContent.trim() === onchainCanonical);

  // ─── Fetch routing-proof signature ──────────────────────────────────
  await broker.inference.processResponse(providerAddress, zgResKey, llmContent);
  const sigData = await (
    InferenceVerifier as unknown as {
      fetchSignatureByChatID: (
        url: string,
        chatID: string,
        model: string,
      ) => Promise<{ text: string; signature: string }>;
    }
  ).fetchSignatureByChatID(svc.url ?? "", zgResKey, model);
  console.log("sigData.text:");
  console.log(`  ${JSON.stringify(sigData.text)}`);
  console.log("sigData.signature:", sigData.signature);
  console.log("");

  // ─── Local verification ────────────────────────────────────────────
  const localDigest = hashMessage(sigData.text);
  const recovered = recoverAddress(localDigest, sigData.signature);
  check(
    "ECDSA recovers to teeSignerAddress",
    recovered.toLowerCase() === signingAddress.toLowerCase(),
    `recovered=${recovered}`,
  );

  // Parse 2nd field (response sha256) from signedText
  const fields = sigData.text.split(":");
  if (fields.length < 5) {
    check("signedText has ≥5 colon-delimited fields", false);
    return;
  }
  const reqShaHex = fields[0];
  const respShaHex = fields[1];
  const providerType = fields[2];
  const providerIdentity = fields[3];
  const tlsFpHex = fields[4];
  console.log("parsed signedText fields:");
  console.log(`  reqSha:     0x${reqShaHex}`);
  console.log(`  respSha:    0x${respShaHex}`);
  console.log(`  providerT:  ${providerType}`);
  console.log(`  providerI:  ${providerIdentity}`);
  console.log(`  tlsFp:      0x${tlsFpHex}`);
  console.log("");

  // Compare reqSha to sha256(reqBody)
  const localReqSha = sha256(toUtf8Bytes(reqBody)).slice(2);
  check(
    "sha256(reqBody) matches reqSha field",
    localReqSha === reqShaHex,
    `local=${localReqSha.slice(0, 16)}…  remote=${reqShaHex.slice(0, 16)}…`,
  );
  // Compare respSha to sha256(responseBody)
  const localRespSha = sha256(responseBody).slice(2);
  check(
    "sha256(responseBody) matches respSha field",
    localRespSha === respShaHex,
    `local=${localRespSha.slice(0, 16)}…  remote=${respShaHex.slice(0, 16)}…`,
  );

  // Find canonical content offset in responseBody
  const enc = new TextEncoder();
  const needle = enc.encode('"content":"');
  const canonicalBytes = enc.encode(onchainCanonical);
  let contentOffset = -1;
  outer: for (
    let i = 0;
    i <= responseBody.length - needle.length - canonicalBytes.length - 1;
    i++
  ) {
    for (let j = 0; j < needle.length; j++) {
      if (responseBody[i + j] !== needle[j]) continue outer;
    }
    const off = i + needle.length;
    for (let j = 0; j < canonicalBytes.length; j++) {
      if (responseBody[off + j] !== canonicalBytes[j]) continue outer;
    }
    if (responseBody[off + canonicalBytes.length] === 0x22) {
      contentOffset = off;
      break;
    }
  }
  check(
    "canonical bytes located at quote-bracketed offset in responseBody",
    contentOffset >= 0,
    `contentOffset=${contentOffset}`,
  );

  // Confirm on-chain digest equals local digest
  const onchainDigest = (await escrow.teeSignedTextDigest(
    hexlify(toUtf8Bytes(sigData.text)),
  )) as string;
  check(
    "BattleEscrow.teeSignedTextDigest matches local hashMessage",
    onchainDigest === localDigest,
    `onchain=${onchainDigest}  local=${localDigest}`,
  );

  console.log("");
  console.log("Path 1A-Hash bundle ready for on-chain submission:");
  console.log(`  battleId:       ${battleId}`);
  console.log(`  winner:         ${winner}`);
  console.log(`  verdictHash:    ${verdictHash}`);
  console.log(`  responseBody:   ${responseBody.length} bytes`);
  console.log(`  contentOffset:  ${contentOffset}`);
  console.log(`  signedText:     "${sigData.text}"`);
  console.log(`  signature:      ${sigData.signature}`);
  console.log("");
  console.log(
    process.exitCode ? "FAILED — see ✗ above" : "ALL CHECKS PASSED ✓",
  );
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
