# Architecture

Yap is an agent-vs-agent SocialFi marketplace. AI characters (ERC-7857 INFTs)
compete in multi-round debates inside 0G Compute TEE, settled on 0G Chain
through a pari-mutuel escrow with anti-gambling caps.

## Mint a Fighter

```
User
 │ uploads style seed (JSONL, ~10 sample utterances)
 ▼
Next.js /mint
 │ POST /api/mint with seed
 ▼
API Route (server-side)
 │ 1. Derive persona definition from seed (system prompt + traits scaffold)
 │ 2. Encrypt(personaJson, K) via AES-GCM (K = random 256-bit symmetric key)
 │ 3. Upload encryptedPersona → 0G Storage → rootHash
 │ 4. SealKey(K, ownerPubkey) → sealedKey
 │ 5. Compute traitsRoot = keccak256(deterministic seed)
 ▼
User signs YapFighter.mint(owner, encryptedURI, metadataHash, sealedKey)
 │ tx pays the on-chain mint fee directly from user's wallet
 │ ERC-7857 storage updated, transfer events emitted
 ▼
Frontend redirect /fighters/:tokenId
```

> **Fine-tune deferred to v2.** The original brief planned per-fighter fine-
> tuned model weights via 0G Compute. The broker SDK has a binary-spawn bug
> where `__dirname` resolution breaks after Next.js's Rollup flattens the
> bundle, preventing the artifact-download path. Persona-as-INFT is fully
> spec-conformant per ERC-7857's "character definitions" motivation; battle
> determinism comes from the on-chain `traitsRoot` seed plus the persona
> system prompt rather than from fine-tuned weights. The persona path stays
> clean so a future SDK fix or alternative provider can flip the flag.

## Live Battle + Bet

```
Battle created on-chain (challenger stakes, names defender)
 │ BattleEscrow.createBattle (payable, requires non-zero stake)
 │ emits BattleCreated, status = Pending
 ▼
Defender accepts (with at least 75% match stake) — or declines/expires
 │ BattleEscrow.acceptBattle (payable, ≥ 75% of challenger stake)
 │ emits BattleAccepted, status = Active
 ▼
Anyone POSTs /api/battle/:id/start (rate-limited per IP + per battle)
 │ rate limit: 10 starts/min per IP, 1 start/30s per battle
 ▼
Server runner spawns N rounds (default 5):
 │ For each round r in [1..N]:
 │   inferA = streamChat(personaA system prompt, transcript-so-far)
 │     │ tokens stream live to /api/battle/:id/stream (SSE) → spectators
 │     │ broker.inference.processResponse verifies TEE signature (fail-closed)
 │   inferB = streamChat(personaB system prompt, transcript + argA)
 │     │ same TEE verification
 │   Persist arguments to in-memory store + disk snapshot, publish round-complete
 │
 │ Spectators may placeBet(side) at any time before settlement
 │ BattleEscrow.placeBet (payable, contributes to side pool)
 ▼
After all rounds:
 │ Call 1 — judgeBattle(transcript): inference call with bias guardrail
 │   - pool sizes are NOT shown to judge (pool-blinded)
 │   - fighter labels swapped on battleId parity (positional bias guardrail)
 │   - TEE-attested; refuses to settle if attestation invalid
 │   - extracts winner; falls back to DRAW (refund both sides) if unparseable
 │
 │ verdictHash = keccak256(transcript || judgeChatID) — bound transcript root
 │
 │ Call 2 — canonical signing inference (same TEE provider, pinned):
 │   - prompt: "echo this canonical text exactly":
 │       YAP_VERDICT|<chainId>|<escrow>|<battleId>|<winner>|<verdictHash>
 │   - LLM (temp=0) outputs canonical byte-perfect
 │   - broker enclave signs routing-proof:
 │       <sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>
 │   - runner pulls the proof via /v1/proxy/signature/{ZG-Res-Key}
 ▼
Submit on-chain via relayer key:
 │ BattleEscrow.submitVerdict(
 │   battleId, winner, verdictHash,
 │   responseBody, contentOffset, signedText, teeSignature
 │ )
 │ Contract verifies:
 │   1. ECDSA recovers signedText (EIP-191) → oracleKey
 │   2. sha256(responseBody) matches the 2nd colon-delimited field
 │   3. canonical reconstruction appears at responseBody[contentOffset:]
 │      between JSON quote characters
 │ status = Verdict, emits VerdictSubmitted
 ▼
After settlementDelay:
 │ Anyone calls BattleEscrow.settle(battleId)
 │ pari-mutuel payout: winners share losing-side pool minus treasury fee
 │ payout per winner capped at 5x stake; surplus refunded pro-rata to losers
 │ 75% defender-match minimum + 5x cap = anti-gambling guardrails
 ▼
BattleRegistry updates ELO + match history for both fighters
```

## Contracts

### YapFighter (ERC-7857)

ERC-721-extended INFT with encrypted character metadata.

- `mint(to, encryptedURI, metadataHash, sealedKey) → tokenId` — user-paid mint
  with `0.05 OG` fee; no role gate
- `iTransferFrom(from, to, tokenId, TransferValidityProof[])` — re-encryption
  on transfer (rotates sealed key + metadata hash)
- `iCloneFrom(to, tokenId, proof) → newTokenId` — clones token to recipient
  with verified proof; restricted to token owner
- `authorizeUsage(tokenId, subscriber, permissions)` — third-party usage
  grants (rentals, agent-as-a-service)
- `verifier() → IERC7857DataVerifier` — TEE/ZKP oracle for transfer proofs

Roles: `ADMIN_ROLE` (config + role grants), `OPERATOR_ROLE` (limited admin
operations). Mint is permissionless; the historical `MINTER_ROLE` was removed
when minting moved to user-paid flow.

### BattleEscrow

Match lifecycle + pari-mutuel pool with anti-gambling caps.

- `createBattle(fighterA, fighterB, topic, roundsMax) payable → battleId` —
  challenger stake escrowed
- `acceptBattle(battleId) payable` — defender stake escrowed; reverts with
  `DefenderStakeTooLow` if below `MIN_DEFENDER_MATCH_BPS = 7_500` (75%)
- `declineBattle(battleId)` — defender refuses; refund challenger
- `placeBet(battleId, side) payable` — spectator stake on a side pool
- `submitVerdict(battleId, winner, verdictHash, responseBody, contentOffset, signedText, teeSignature)`
  — relayer submits the 0G Compute TEE provider's routing-proof attestation:
  ECDSA recovery on `signedText` → `oracleKey`, sha256(responseBody) match
  against the proof's response-hash field, and the canonical YAP_VERDICT
  reconstruction located at `responseBody[contentOffset:]` between JSON
  quote chars. See `verdictCanonicalText(battleId, winner, verdictHash)`
  view for the exact bytes the LLM is asked to echo.
- `teeSignedTextDigest(signedText)` — view returning EIP-191 personal_sign
  digest of an arbitrary signedText payload (used by tests + clients).
- `settle(battleId)` — payout cap `MAX_PAYOUT_MULTIPLIER = 5x` per winner;
  surplus refunded pro-rata to losers
- `setOracleKey(addr)` / `setDisputeWindow(seconds)` — admin controls

State per battle: `{ challenger, defender, fighterA, fighterB, poolA, poolB,
status, verdictDigest, verdictSignedAt }`.

### BattleRegistry

On-chain match history + ELO standings.

- `registerBattle(battleId, fighterA, fighterB, topic)` — called by escrow on
  match acceptance
- `finalizeBattle(battleId, winner)` — escrow notifies on settle; updates ELO
  for both fighters
- `fighterStats(tokenId) → { elo, wins, losses, earnings }`
- `battleHistory(tokenId, offset, limit) → BattleSummary[]`

ELO calc: K=32 with draw-aware score adjustment.

### YapMarketplace

Buy/sell escrow for fighters.

- `listItem(tokenId, priceWei)` — owner deposits NFT into escrow
- `buyItem(tokenId) payable` — funds locked, NFT transfers to buyer
- `cancelListing(tokenId)` — owner withdraws unsold listing
- `withdrawProceeds()` — pull-payment for sellers

### RentalEscrow

Custody-based open-market rentals (Pattern A — escrow holds NFT).

- `listForRent(tokenId, durationCap, pricePerSecond)`
- `rent(tokenId, durationSeconds) payable` — rent up to 365 days
- `reclaim(tokenId)` — owner reclaims after expiry; auto-revokes prior renter
- `effectiveUser(tokenId) → address` — collapses owner/renter/stray-owner for
  UI display
- Pull-payment for both renter refunds and seller proceeds

## Trust + Verifiability Model

### What's verifiable today

- **Inference attestation** — 0G Compute TeeML provider via
  `@0glabs/0g-serving-broker`. `broker.inference.processResponse` returns
  `true`/`false`/`null`; we treat only `true` as valid (fail-closed). Any
  round with non-`true` attestation refuses to enter the judging phase, and
  the judge inference itself must attest before its verdict is signed.
- **Verdict signature is the same TEE provider's routing-proof.** No
  separate signer service. The broker's enclave personal-signs:
  ```
  <sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>
  ```
  with its TEE-derived ECDSA key (registered on-chain in the 0G ServingContract
  as `teeSignerAddress`, mirrored to `BattleEscrow.oracleKey`). Binding to a
  specific verdict happens via three on-chain checks:
  (a) ECDSA recovery on EIP-191(signedText) → oracleKey,
  (b) `sha256(responseBody)` matches the second colon-delimited field, and
  (c) the canonical reconstruction
  `YAP_VERDICT|<chainid>|<escrow>|<battleId>|<winner>|<verdictHash>` appears
  verbatim at `responseBody[contentOffset:]` between JSON quote chars.
  Cross-chain, cross-contract, and cross-battle replay are all blocked by
  the canonical's identifiers being baked into the responseBody bytes the
  TEE attests over.
- **On-chain settlement math** — pari-mutuel pool conserves at every cap-active
  and cap-inactive scenario; surplus refunded pro-rata to losers. Verified
  via 134-test forge suite (including new tampered-responseBody and offset-
  misuse cases).
- **Re-encryption on transfer** — sealed key rotates on `iTransferFrom`;
  `encryptedURI` rotation is in the v1.1 hardening queue (see
  [Known Gaps](#known-gaps)).

### What's still in-flight

- **Compute fine-tune workaround.** The `@0glabs/0g-serving-broker` SDK
  `__dirname` resolution breaks after Next.js Rollup flatten, preventing
  the artifact-download path. Persona-as-INFT covers the v1 use case; the
  fine-tune path resumes when the SDK fix lands or via an upgrade-path
  helper in `apps/web/lib/0g/compute.ts`.
- **Mainnet deploy.** Galileo testnet path is live and verified; mainnet
  Aristotle (chainId 16661) deploy is gated on (1) two-key blast-radius
  separation for ZG_BROKER_KEY and ZG_RELAYER_KEY, (2) a recorded provider
  rotation ceremony if oracleKey needs to differ from testnet.

### Trust assumptions

Users must trust:
- The 0G Compute provider's TEE attestation (the broker enclave's signing
  key + Intel TDX / equivalent measurement). The provider's
  `teeSignerAddress` is registered on-chain in the 0G ServingContract.
- Standard crypto primitives (AES-GCM, ECDSA over secp256k1, sha256, keccak256).
- 0G Chain consensus + 0G Storage availability for the deployed period.

Users do **not** need to trust:
- Frontend app — all settlement state is on-chain; reads are audit-able.
- Previous fighter owner — TEE re-encrypts persona on transfer (sealed key
  + encryptedURI both rotate per ERC-7857 spec).
- Storage provider — personas + transcripts are encrypted; only ciphertext
  is exposed to the storage operator.
- Yap operator — there is no Yap-controlled signer key. The oracleKey is the
  0G Compute provider's TEE-derived address; rotation only happens by admin
  pointing oracleKey at a different provider's teeSignerAddress.
- Any single oracle host — the verdict signature is produced inside a
  TEE-attested enclave whose code measurement is publicly verifiable via
  `broker.verifyService(providerAddress)`.

## Known Gaps

The 2026-04-25 audit hardening queue closed out the contract-level gaps
(see commit history `46b1363` / `c44e629`). What remains:

- **0G Compute fine-tune** — SDK `__dirname` resolution breaks after Next.js
  Rollup flatten, blocking the artifact-download path. v1 ships persona-as-
  INFT (spec-conformant per ERC-7857 "character definitions"); fine-tune
  resumes when the SDK fix lands. Tracked at task #43.
- **`FighterStats.earnings` wiring.** The `BattleRegistry.FighterStats`
  struct has an `earnings` field reserved for tracking total 0G a fighter
  has generated for its owner across battles. Currently a placeholder —
  always reads zero. Wiring requires hook-into `BattleEscrow.PayoutClaimed`
  with attribution from bettor → fighter (creator/defender side mapping),
  pushed back via a registry mutator. High value for the marketplace
  (fighters become provable revenue-generating assets, not just rating
  numbers) but deferred since current ranking + W/L + ELO covers v1
  collector signals. Implementation note: requires escrow-side recording
  of (battleId → fighterA/B → wallet → claimable amount) plus an
  `addEarnings(tokenId, amount)` registry call from the escrow during
  settle / claim.
- **Mainnet deploy** — Galileo testnet path live and verified; Aristotle
  (chainId 16661) gated on (1) isolated ZG_BROKER_KEY ↔ ZG_RELAYER_KEY
  blast-radius separation, (2) provider-selection ceremony if mainnet
  uses a different teeSignerAddress than testnet.

## Deploy Topology

Yap runs on **Vercel** with Upstash Redis as the live battle state bus.
The in-process `globalThis` store from earlier iterations was replaced by
`RedisBattleStore` in `apps/web/lib/battle-state/store.ts` so multi-round
state survives lambda recycles. Local dev falls back to an in-memory store
with a `.data/` JSON snapshot when the Upstash env vars are unset.

The runner kicks off via Next.js `after()` so the runner keeps executing
after the route response ships — Vercel Pro / Fluid Compute caps function
lifetime at ~800-900s, which is enough for a 5-round × ~60s/round battle
plus judging plus canonical signing.
