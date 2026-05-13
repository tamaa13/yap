// Opsi B smoke test — fresh-wallet client-funded persona scoring on
// 0G Aristotle mainnet (chainId 16661).
//
// Drives the same code path as `hooks/use-score-persona.ts` +
// `lib/0g/client/score-persona.ts`, only with an ethers `Wallet`
// instead of a `BrowserProvider`-derived signer. Hermetic: no
// MetaMask, no UI race.
//
// Usage:
//
//   pnpm --filter web tsx scripts/opsi-b-smoke.ts gen
//     → generates a fresh PK, writes /tmp/opsi-b-test.key, prints
//       the address. Tama funds this address manually.
//
//   pnpm --filter web tsx scripts/opsi-b-smoke.ts run
//     → reads PK from /tmp/opsi-b-test.key and runs steps 0-4 of
//       docs/opsi-b-e2e-plan.md. Stops + reports on any failure.
//
// Token-burn discipline: hard-pinned to llmSamples=1 (probe mode).
// Full-sample escalation requires changing this file.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  JsonRpcProvider,
  Wallet,
  parseEther,
  formatEther,
  verifyMessage,
  Contract,
} from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { sha256 } from "viem";
import { stringToBytes } from "viem/utils";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// Import the CLIENT module — same code path the UI hook exercises.
// "use client" is a Next/Turbopack directive; under tsx it's a no-op.
import { scorePersona } from "../lib/0g/client/score-persona";

const KEY_FILE = "/tmp/opsi-b-test.key";
const LLM_SAMPLES = 1 as const; // probe — never bump without plan revision
const DEPOSIT_OG = 0.5;
const TRANSFER_OG_WEI = parseEther("0.5");
const FIXED_SEED = `I refuse the comfortable middle. Either a claim survives its strongest objection, or it doesn't. Hedging is a tax we pay to look reasonable, and the bill is paid in clarity. Show me your premise, your inference, and the edge case you didn't dodge — I'll meet you there or concede the ground.`;

const YAP_FIGHTER_ABI = ["function oracleKey() view returns (address)"] as const;

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn(`[opsi-b] no .env.local at ${envPath}`);
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

function fmt(wei: bigint): string {
  return `${formatEther(wei)} OG`;
}

function header(s: string): void {
  console.log(`\n=== ${s} ===`);
}

function pass(s: string): void {
  console.log(`  ✓ ${s}`);
}

function fail(s: string): never {
  console.error(`  ✗ ${s}`);
  console.error(`\n[opsi-b] STOPPING — no retries (token-burn discipline).`);
  process.exit(1);
}

// ─── gen subcommand ─────────────────────────────────────────────────────

function genWallet(): void {
  if (fs.existsSync(KEY_FILE)) {
    console.error(
      `[opsi-b] ${KEY_FILE} already exists. Delete it manually if you want a new wallet.`,
    );
    process.exit(1);
  }
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  fs.writeFileSync(KEY_FILE, pk, { mode: 0o600 });
  console.log(`\n[opsi-b] fresh wallet generated.`);
  console.log(`  address:     ${account.address}`);
  console.log(`  pk file:     ${KEY_FILE}  (mode 0600, not committed)`);
  console.log(`  fund with:   2.0 OG on Aristotle mainnet (chainId 16661)`);
  console.log(`\nWhen Tama confirms the fund tx, run:`);
  console.log(`  pnpm --filter web tsx scripts/opsi-b-smoke.ts run\n`);
}

// ─── run subcommand ─────────────────────────────────────────────────────

async function run(): Promise<void> {
  loadEnvLocal();

  if (!fs.existsSync(KEY_FILE)) {
    fail(`${KEY_FILE} missing — run 'gen' first to provision a wallet.`);
  }
  const testPk = fs.readFileSync(KEY_FILE, "utf8").trim();
  if (!testPk.startsWith("0x") || testPk.length !== 66) {
    fail(`${KEY_FILE} does not contain a 0x-prefixed 32-byte hex private key.`);
  }

  const serverPk = process.env.ZG_BROKER_KEY;
  if (!serverPk) fail("ZG_BROKER_KEY not set in .env.local (needed to snapshot server broker balance).");

  const providerAddress = process.env.ZG_INFERENCE_PROVIDER;
  if (!providerAddress) fail("ZG_INFERENCE_PROVIDER not set in .env.local.");

  const fighterAddr =
    process.env.NEXT_PUBLIC_YAP_FIGHTER_ADDR_MAINNET ??
    process.env.YAP_FIGHTER_ADDR;
  if (!fighterAddr) fail("NEXT_PUBLIC_YAP_FIGHTER_ADDR_MAINNET not set.");

  const rpc = process.env.ZG_MAINNET_RPC ?? "https://evmrpc.0g.ai";
  const rpcProvider = new JsonRpcProvider(rpc);
  const net = await rpcProvider.getNetwork();
  if (net.chainId !== 16661n) {
    fail(`Connected to chainId ${net.chainId}, expected 16661 (Aristotle mainnet).`);
  }
  console.log(`[opsi-b] network: Aristotle mainnet (16661) @ ${rpc}`);

  const testWallet = new Wallet(testPk, rpcProvider);
  const serverWallet = new Wallet(serverPk, rpcProvider);
  console.log(`[opsi-b] test wallet:    ${testWallet.address}`);
  console.log(`[opsi-b] server broker:  ${serverWallet.address}  (must stay flat)`);
  console.log(`[opsi-b] provider:       ${providerAddress}`);
  console.log(`[opsi-b] fighter:        ${fighterAddr}`);

  // ── Step 0: snapshot ─────────────────────────────────────────────────
  header("Step 0 — initial snapshot");
  const serverBalanceBefore = await rpcProvider.getBalance(serverWallet.address);
  const userBalanceBefore = await rpcProvider.getBalance(testWallet.address);
  console.log(`  server broker: ${fmt(serverBalanceBefore)}`);
  console.log(`  test wallet:   ${fmt(userBalanceBefore)}`);
  // Funding floor: 0.501 OG = 0.5 (depositFund msg.value) + ~0.001 (gas
  // for 2 txs). transferFund moves balance INSIDE the ledger contract
  // (ledger.availableBalance → sub-account) with no msg.value, so the
  // EOA only pays gas there. SDK ref: lib/ledger/contract/ledger.js:157.
  if (userBalanceBefore < parseEther("0.501")) {
    fail(
      `Test wallet balance ${fmt(userBalanceBefore)} below floor 0.501 OG. ` +
        `Send more OG to ${testWallet.address} before running.`,
    );
  }
  pass(`test wallet above 0.501 OG floor`);

  const broker = await createZGComputeNetworkBroker(testWallet);
  pass(`broker initialized with test wallet`);

  let ledgerBefore = 0n;
  try {
    const ledger = await broker.ledger.getLedger();
    ledgerBefore = ledger.availableBalance;
  } catch {
    // expected — fresh wallet has no ledger account
  }
  if (ledgerBefore !== 0n) {
    console.warn(`  ! test wallet ledger non-empty: ${fmt(ledgerBefore)} — wallet is not fresh.`);
  } else {
    pass(`test wallet has no prior ledger account (fresh)`);
  }

  let subBefore = 0n;
  try {
    const account = await broker.inference.getAccount(providerAddress);
    subBefore = account.balance - (account.pendingRefund ?? 0n);
  } catch {
    // expected — fresh wallet has no sub-account
  }
  if (subBefore !== 0n) {
    console.warn(`  ! test wallet sub-account non-empty: ${fmt(subBefore)} — wallet is not fresh.`);
  } else {
    pass(`test wallet has no prior sub-account (fresh)`);
  }

  // ── Step 1: depositFund ──────────────────────────────────────────────
  header(`Step 1 — depositFund(${DEPOSIT_OG} OG)`);
  await broker.ledger.depositFund(DEPOSIT_OG);
  const ledgerAfter = await broker.ledger.getLedger();
  console.log(`  ledger availableBalance: ${fmt(ledgerAfter.availableBalance)}`);
  if (ledgerAfter.availableBalance < parseEther("0.5")) {
    fail(`Ledger availableBalance ${fmt(ledgerAfter.availableBalance)} below 0.5 OG after deposit.`);
  }
  pass(`ledger >= 0.5 OG`);

  // ── Step 2: transferFund ─────────────────────────────────────────────
  header(`Step 2 — transferFund(${providerAddress}, "inference", 0.5 OG)`);
  await broker.ledger.transferFund(providerAddress, "inference", TRANSFER_OG_WEI);
  const account = await broker.inference.getAccount(providerAddress);
  const spendable = account.balance - (account.pendingRefund ?? 0n);
  console.log(`  sub-account spendable:   ${fmt(spendable)}`);
  if (spendable < parseEther("0.5")) {
    fail(`Sub-account spendable ${fmt(spendable)} below 0.5 OG after transfer.`);
  }
  pass(`sub-account >= 0.5 OG`);

  // ── Step 3: scorePersona PROBE (samples=1) ───────────────────────────
  header(`Step 3 — scorePersona PROBE (llmSamples=${LLM_SAMPLES})`);
  await broker.inference.acknowledgeProviderSigner(providerAddress).catch(() => {});
  const tokenId = 9_999_999; // synthetic — not minted, just bound in canonicalText
  const attestation = await scorePersona(
    broker,
    {
      seed: FIXED_SEED,
      tokenId,
      fighterAddr: fighterAddr as `0x${string}`,
      chainId: 16661,
      providerAddress,
    },
    { llmSamples: LLM_SAMPLES },
  );

  // shape asserts
  if (attestation.scores.length !== 5) {
    fail(`scores length ${attestation.scores.length}, expected 5.`);
  }
  for (const s of attestation.scores) {
    if (!Number.isInteger(s) || s < 1 || s > 5) {
      fail(`score ${s} outside [1,5].`);
    }
  }
  pass(`5 integer scores ∈ [1,5]: [${attestation.scores.join(",")}]`);

  const expectedSeedHash = sha256(stringToBytes(FIXED_SEED));
  if (attestation.seedHash !== expectedSeedHash) {
    fail(`seedHash mismatch: got ${attestation.seedHash}, expected ${expectedSeedHash}.`);
  }
  pass(`seedHash matches sha256(seed)`);

  const canonPrefix = `YAP_FIGHTER_SCORE|16661|${fighterAddr.toLowerCase()}|${tokenId}|${expectedSeedHash}|`;
  if (!attestation.canonicalText.startsWith(canonPrefix)) {
    fail(`canonicalText does not start with ${canonPrefix}\n  got: ${attestation.canonicalText}`);
  }
  pass(`canonicalText matches template`);

  // teeSignature recovery
  const recovered = verifyMessage(attestation.signedText, attestation.teeSignature);
  console.log(`  recovered signer:        ${recovered}`);
  const yap = new Contract(fighterAddr, YAP_FIGHTER_ABI, rpcProvider);
  const oracleKey = (await yap.oracleKey()) as string;
  console.log(`  YapFighter.oracleKey():  ${oracleKey}`);
  if (recovered.toLowerCase() !== oracleKey.toLowerCase()) {
    fail(`teeSignature recovered to ${recovered}, expected oracleKey ${oracleKey}.`);
  }
  pass(`teeSignature recovers to YapFighter.oracleKey()`);

  if (attestation.lowConfidence) {
    fail(`lowConfidence=true with samples=1 should be impossible (no spread to flag).`);
  }
  pass(`lowConfidence=false`);

  // ── Step 4: broker EOA invariant ─────────────────────────────────────
  header("Step 4 — broker EOA invariant");
  const serverBalanceAfter = await rpcProvider.getBalance(serverWallet.address);
  const userBalanceAfter = await rpcProvider.getBalance(testWallet.address);
  console.log(`  server broker before: ${fmt(serverBalanceBefore)}`);
  console.log(`  server broker after:  ${fmt(serverBalanceAfter)}`);
  console.log(`  delta:                ${fmt(serverBalanceAfter - serverBalanceBefore)}`);
  if (serverBalanceAfter !== serverBalanceBefore) {
    fail(
      `BROKER EOA INVARIANT VIOLATED. ` +
        `Server broker balance changed by ${fmt(serverBalanceAfter - serverBalanceBefore)}. ` +
        `Opsi B is leaking — server is still paying.`,
    );
  }
  pass(`server broker EOA balance UNCHANGED — Opsi B invariant holds`);

  // Only depositFund moved OG out of the EOA (msg.value=0.5). transferFund
  // shifted balance ledger→sub-account inside the contract — no EOA outflow.
  const userSpent = userBalanceBefore - userBalanceAfter - parseEther("0.5");
  console.log(`\n  test wallet before:   ${fmt(userBalanceBefore)}`);
  console.log(`  test wallet after:    ${fmt(userBalanceAfter)}`);
  console.log(`  custody locked:       0.5 OG (recoverable via refund flow)`);
  console.log(`  actually spent:       ${fmt(userSpent)}  (gas for 2 txs + LLM)`);

  // ── Summary ──────────────────────────────────────────────────────────
  header("ACCEPTANCE CRITERIA");
  console.log(`  [✓] Broker EOA invariant — balance UNCHANGED`);
  console.log(`  [✓] Ledger visible on-chain — ${fmt(ledgerAfter.availableBalance)}`);
  console.log(`  [✓] Sub-account visible on-chain — ${fmt(spendable)}`);
  console.log(`  [✓] scorePersona response shape valid + teeSig → oracleKey`);
  console.log(`  [ ] No [WARN] Transferring in server pm2 logs — verify manually:`);
  console.log(`        pm2 logs yap-web --raw --lines 200 | grep -c "Transferring"`);
  console.log(`        (expected: 0)`);
  console.log(`\n[opsi-b] smoke complete.\n`);
}

// ─── entry ──────────────────────────────────────────────────────────────

const cmd = process.argv[2];
if (cmd === "gen") {
  genWallet();
} else if (cmd === "run") {
  run().catch((e) => {
    console.error(`\n[opsi-b] uncaught: ${e instanceof Error ? e.stack : e}`);
    process.exit(1);
  });
} else {
  console.error("Usage: tsx scripts/opsi-b-smoke.ts <gen|run>");
  process.exit(1);
}
