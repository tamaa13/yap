# Opsi B E2E Test Plan — Client-Side Persona Scoring

**Branch:** `feat/opsi-b-client-scoring` (head `0c16a0b`)
**Network:** 0G Aristotle mainnet, chainId `16661`
**Author:** assistant (awaiting Tama greenlight before merge)

The point of this test is to prove **one economic invariant**: the server
broker EOA (`0x1d4D…485D`) does not pay for persona scoring under
Opsi B. The user's wallet pays. Everything else (response shape,
TEE signature, on-chain ledger visibility) is downstream of that.

---

## 1. Test wallet provisioning

| Field | Value |
| --- | --- |
| Wallet | **fresh** generated locally, never used on 0G before |
| Private key | `cast wallet new` or `viem.generatePrivateKey()` — kept in `/tmp/opsi-b-test.key`, never committed |
| Address | recorded in test script output |
| Funding source | manual transfer from Tama's main test wallet via MetaMask (one tx) |
| Funding amount | **3.05 OG** (see §3 for derivation) |
| Runner | Node script in `apps/web/scripts/opsi-b-smoke.ts`, signs with the test PK via `new Wallet(pk, provider)` |

The runner does NOT use the browser. It instantiates the broker the
same way the React hook does, only with a `Wallet` instead of a
`BrowserProvider`-derived `JsonRpcSigner`. That makes the test
hermetic — no MetaMask popups, no UI race conditions — and the code
path under test (`createUserBroker` → `broker.ledger.depositFund` →
`broker.ledger.transferFund` → `scorePersona`) is byte-identical to
what the UI exercises.

After the headless run lands clean, Tama does **one** UI smoke run by
hand from MetaMask to confirm the per-phase cards render correctly.

---

## 2. Step-by-step sequence

Driver: `apps/web/scripts/opsi-b-smoke.ts` (to be written before merge).

```
0. setup
   - read ZG_BROKER_KEY_PUBLIC_ADDR ("0x1d4D…485D") from env
   - snapshot serverBalanceBefore = provider.getBalance(brokerEOA)
   - snapshot userBalanceBefore   = provider.getBalance(testWallet)
   - assert testWalletLedger.getLedger() throws or returns 0
     (proves fresh wallet — no prior ledger account)
   - assert testWalletSubAccount.getAccount(provider) throws or balance=0

1. deposit (user wallet signs)
   - broker.ledger.depositFund(3)   // contract minimum for new accounts
   - poll broker.ledger.getLedger() until availableBalance >= 3 OG
   - log gasUsed for the tx

2. transfer (user wallet signs)
   - broker.ledger.transferFund(provider, "inference", parseEther("0.5"))
   - poll broker.inference.getAccount(provider) until balance >= 0.5 OG
   - log gasUsed for the tx

3. scorePersona PROBE (samples=1)
   - scorePersona(broker, { seed, tokenId, fighterAddr, chainId: 16661 },
                          { llmSamples: 1 })
   - 3 dimension calls + 1 canonical-echo call = 4 LLM calls total
   - assert response.scores.length === 5 and each ∈ [1,5]
   - assert response.canonicalText starts with "YAP_FIGHTER_SCORE|16661|"
   - assert response.teeSignature recovers to oracleKey on YapFighter
     (verifyMessage(signedText, teeSignature) === oracleKey)
   - assert response.lowConfidence === false  (1-sample = trivially confident)

4. invariant check
   - serverBalanceAfter = provider.getBalance(brokerEOA)
   - assert serverBalanceAfter === serverBalanceBefore   ← THE WHOLE POINT
   - userBalanceAfter   = provider.getBalance(testWallet)
   - log spent = userBalanceBefore - userBalanceAfter - 3 (depositFund locked
     3 OG into the ledger contract — that's not "spent", just transferred
     custody; recoverable via refund. transferFund is intra-contract.)
```

Step 3 is **probe mode** (`llmSamples: 1`). Full 5-sample (`llmSamples: 5`)
adds 12 more LLM calls. Do not run it until probe passes. If Tama
wants a full-sample run after probe is green, that's a follow-up.

---

## 3. Cost projection

**SDK corrections (both surfaced 2026-05-13 mid-test):**

1. `transferFund` does NOT carry `msg.value`. It calls the ledger
   contract which shifts balance internally from
   `ledger.availableBalance` → per-provider sub-account
   (`node_modules/@0gfoundation/0g-compute-ts-sdk/lib.commonjs/ledger/contract/ledger.js:157`).
   Only `depositFund` moves OG out of the EOA.
2. `depositFund` on a wallet **without an existing ledger account**
   has a contract-enforced minimum of **3 OG**. Smaller amounts revert
   the tx with `"contract requires a minimum of 3 0G"`. Subsequent
   top-ups of an existing ledger can be any amount. SDK ref:
   `lib/ledger/broker.ts:175`. **The hook (`use-score-persona.ts`) +
   client `inference.ts` are now hard-floored at 3 OG (`Math.max(3,
   envOverride)`) so a misconfigured env can't break fresh mints.**

Per-call breakdown (worst-case Aristotle mainnet, fresh wallet):

| Item | EOA outflow | Notes |
| --- | --- | --- |
| `depositFund(3)` msg.value | 3 OG | contract minimum; locked into ledger custody, recoverable via refund (§4) |
| `depositFund(3)` gas | ~0.0005 OG | ~80-100k gas × ~5 gwei |
| `transferFund(0.5)` gas | ~0.0005 OG | NO msg.value — internal balance shift only |
| 1 LLM call (provider charge) | ~0.0001 OG | empirical, prior testnet runs |

**Probe run (samples=1) totals:**

- EOA outflow into custody: 3 OG (recoverable via refund flow)
- gas for 2 txs: ~0.001 OG
- LLM: 4 calls × ~0.0001 OG = ~0.0004 OG
- **total OG actually spent (gas + LLM): ~0.0014 OG**
- **total OG still recoverable (custody in ledger/sub-account): 3 OG**

**Funding floor:** 3.001 OG (3 deposit + ~0.001 gas).
**Funding target:** **3.05 OG** — small headroom over floor covers gas
variance + 1 RPC retry. Smoke script asserts at 3.001 floor and stops
short if Tama under-funds.

If a full-sample run follows probe, add 12 more LLM calls ≈ 0.0012 OG.
Still trivial against the 3.05 OG target.

---

## 4. Failure rollback

**Mid-cycle scoring failure (e.g., judge_unstable, canonical-echo mismatch):**

- Deposited 3 OG (minus the 0.5 OG transferred out) sits in the ledger
  (`getLedger().availableBalance` ≈ 2.5 OG after step 2). Recoverable
  via `broker.ledger.requestRefund(amount)` → 24h cool-down →
  `broker.ledger.processRefund()`. This is the standard 0G Compute
  ledger flow, not Opsi-B-specific.
- Transferred 0.5 OG sits in the provider sub-account
  (`getAccount(provider).balance`). Recoverable via
  `broker.ledger.retrieveFund([provider], "inference")` which moves
  the sub-account balance back into the ledger, then refund from there.

**Broker SDK init failure on client (e.g., RPC down):**

- Hook transitions to `phase: "error"` with the message bubbled from
  `createUserBroker` → `BrowserProvider.getSigner()`.
- UI surfaces error in the existing red-text block.
- User retries with the same wallet — no state lost (broker is built
  fresh from `walletClient` each `start()`).

**MetaMask rejects depositFund prompt:**

- ethers throws `ACTION_REJECTED`. Hook catches in `deposit()` catch
  block, transitions to `phase: "error"`, surfaces message
  `"depositFund failed: user rejected action"`.
- UI re-renders the `needs_ledger` card with the error visible. User
  can click "Approve deposit" again or close the modal.

**Sub-account drains mid-cycle** (e.g., parallel scoring run depleted it):

- `runChat`'s internal `ensureFunded` (the paranoia rail at
  `lib/0g/client/inference.ts:90`) re-probes and issues a top-up
  `transferFund` from the user's wallet. Surfaces as a second
  MetaMask popup mid-scoring. Acceptable for hackathon scale (single
  user, rare).

---

## 5. Acceptance criteria

Tick all five before greenlighting the merge.

- [ ] **Broker EOA invariant.** Balance of `0x1d4D…485D` is byte-equal
      before and after the full probe run. Verified with two
      `provider.getBalance(...)` calls and a strict `===` assert.
- [ ] **Ledger visibility on-chain.** `broker.ledger.getLedger()` for
      the test wallet returns `availableBalance >= parseEther("3")`
      after step 1 (the contract minimum for account creation).
- [ ] **Sub-account visibility on-chain.**
      `broker.inference.getAccount(provider)` for the test wallet
      returns `balance >= parseEther("0.5")` after step 2.
- [ ] **scorePersona response shape.** `scores` is a 5-tuple of
      integers in `[1,5]`; `canonicalText` matches the
      `YAP_FIGHTER_SCORE|...` template; `teeSignature` recovers to
      the YapFighter contract's `oracleKey()`.
- [ ] **No server-broker LLM calls.** `pm2 logs yap-web --raw --lines 200`
      taken during the test window contains zero
      `[WARN] Transferring` lines from the server-side broker
      (those are the lines `lib/0g/inference.ts:ensureFunded` emits
      when it fires). Server should be silent for the entire test.

---

## Out of scope for this test

- UI rendering of per-phase cards (covered by a separate manual
  MetaMask run, post-merge).
- Refund/retrieval flow (works the same as before Opsi B, not
  changed by this branch).
- Storage submission (`/api/mint/score` still has the mock-fallback
  path; this branch doesn't touch storage).
- Battle-runner code paths (server-side `lib/0g/inference.ts` is
  untouched — battles still pay from the server broker EOA on
  purpose; Opsi B only moves mint scoring).

---

## Open questions for Tama

1. Keep the server `/api/mint/score` route as dev-mode mock fallback,
   or tear it down once Opsi B lands? (My read: keep it, gated on
   `process.env.NODE_ENV !== "production"`.)
2. Full 5-sample mainnet run after probe greens — defer to a separate
   manual test, or roll into this plan as step 3b?
3. After the smoke script lands, do you want it wired into CI as a
   nightly canary, or strictly on-demand?
