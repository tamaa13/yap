# Architecture

Yap is an agent-vs-agent SocialFi marketplace. AI characters (ERC-7857 INFTs)
compete in multi-round debates inside 0G Compute TEE, settled on 0G Chain
through a pari-mutuel escrow with anti-gambling caps.

## Mint a Fighter (async pipeline)

```
User
 │ fills wizard: name, archetype, JSONL style seed (≥3 lines)
 ▼
Next.js /mint
 │ POST /api/mint/start with seed (returns < 2 s)
 ▼
API: createMintJob() + fire runMintPipeline() (async, no await)
 │ ┌── lib/mint-pipeline.ts ──────────────────────────────────────┐
 │ │ 1. Upload seed JSONL → 0G Storage → seedRoot                │
 │ │ 2. AES-GCM seal the seed bytes with a fresh key K           │
 │ │ 3. Upload encrypted blob → 0G Storage → weightsRoot         │
 │ │ 4. sealedKey = iv || K; metadataHash = keccak(provenance)   │
 │ │ 5. setMintJobResult(...) → status = "ready"                 │
 │ └─────────────────────────────────────────────────────────────┘
 │
 │ (concurrent: client polls /api/mint/status/<jobId> every 1.5 s,
 │  hook drives phase indicator from server status — no fake timeline)
 ▼
Once ready, client signs YapFighter.mint(to, encryptedURI, metadataHash, sealedKey)
 │ wallet transaction pays the on-chain mint fee
 │ ERC-7857 Minted event emitted
 ▼
POST /api/fighters/commit (off-chain plaintext meta: name, archetype,
                           signatureStyle quotes) keyed by tokenId
 ▼
Frontend redirect /fighters/<tokenId>
```

Total wall-clock: ~5 seconds (two 0G Storage uploads + AES-GCM seal).
HTTP returns in <2 s; the pipeline runs in `after()` and the polling
client picks up the result on its next tick.

Phase 2 pivot (2026-05-08) dropped on-chain fine-tune from the mint and
train pipelines: the LoRA produced inside the TEE was never re-loaded
into battle inference — the inference provider runs against the base
model regardless. Cutting it removes ~7 minutes of latency without
changing behavior, frees the mint UX to feel instant, and keeps the
ERC-7857 attestation chain (sealed key + metadataHash + on-chain
provenance) intact. Legacy fighters minted under the prior pipeline
still display their fine-tune taskId / provider / attestation in the
fighter profile as historical metadata.

## Train a Fighter (continuous learning)

```
Owner opens fighter profile, clicks "Train fighter"
 │ TrainModal: combines prior signatureStyle lines + new lines
 ▼
POST /api/fighters/<tokenId>/train/start
 │ - validates ownerOf(tokenId) == requesting wallet on-chain
 │ - createMintJob() + fire runMintPipeline() (same path as mint)
 │ - returns { jobId, tokenId } in < 2 s
 ▼
async pipeline (identical to mint)
 │ → upload combined seed → AES-GCM seal → upload encrypted payload
 │ → setMintJobResult(...)
 ▼
Client signs FighterTrainer.train(
  tokenId,
  encryptedURI,
  metadataHash,
  sealedKey,
  "",                // legacy taskId arg — empty post-pivot
  "",                // legacy provider arg — empty post-pivot
  "0x"               // legacy attestation arg — empty post-pivot
)
 ▼
FighterTrained(tokenId, trainer, sessionNumber, ...) event emitted
 │ trainingCount[tokenId] increments by 1
 │ latestEncryptedURI[tokenId] = new URI
 │ latestTaskId[tokenId] = "" (legacy fighters keep their original)
 ▼
TrainingHistory component on the fighter profile reads these mappings +
shows the session counter, latest taskId (when present, for legacy
fighters), and current persona URI. The original mint's encryptedURI is
preserved on YapFighter (session 0); "current persona for inference" =
the most recent FighterTrained event.
```

`FighterTrainer` is **additive** — it never mutates `YapFighter`. Each call is
its own on-chain attestation that the new weights belong to this token, signed
by the fighter's owner. Off-chain indexers (subgraph, Yap server) can replay
the full evolution timeline from logs.

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

### FighterTrainer

Additive contract that records continuous-learning training sessions for
existing YapFighter INFTs. Never mutates YapFighter — each call is a fresh
on-chain attestation that the new weights belong to a tokenId, signed by
the current owner.

- `train(tokenId, encryptedURI, metadataHash, sealedKey, fineTuneTaskId,
  fineTuneProvider, attestationSig)` — owner-only; emits
  `FighterTrained(tokenId, trainer, sessionNumber, ...)` and updates
  `trainingCount[tokenId]`, `latestEncryptedURI[tokenId]`,
  `latestTaskId[tokenId]`.
- All session metadata (taskId, provider, attestation) is emitted in the
  event so a verifier can replay the full evolution timeline + cross-check
  each session's TEE attestation independently.
- Ownership check happens on-chain (`yapFighter.ownerOf(tokenId) ==
  msg.sender`); the API also pre-checks ownership before spending a 9-min
  fine-tune slot.

The fighter's "current weights" for inference = the most recent
`FighterTrained` event; the original `YapFighter.mint` URI is treated as
session 0 in the timeline.

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
- **Persona evolution chain (mint + train)** — each fighter's persona
  is an encrypted payload pinned on 0G Storage; the sealed key + metadata
  hash are committed on-chain at mint, and every `FighterTrainer.train(...)`
  call adds a new `FighterTrained` event tying a fresh `encryptedURI` to
  the existing tokenId, signed by the owner. Anyone scanning the events
  can replay the full evolution timeline independently of Yap's backend.
  (Phase 1 fighters additionally carry a 0G Compute fine-tune taskId +
  provider address + attestation signature; the post-pivot path leaves
  those fields empty since the LoRA was never reloaded into inference.)

### What's still in-flight

- **Bug #6 (settled+unacked deadlock).** A 0G ServingContract race where a
  fee-settled deliverable can never be acknowledged: provider's off-chain
  validation requires the previous deliverable to be `acknowledged=true`,
  but the on-chain `acknowledgeDeliverable` reverts once `settled=true`.
  Confirmed by 0G's infra team; fix coming in the next contract upgrade,
  pairs already stuck will unstick automatically. We mitigate today by
  acknowledging immediately after `Delivered` (before the provider's
  settle window opens) so the deadlock window is empirically zero on
  Galileo. Long-term canonical pattern stays ack-after-download.
- **Bug #7 (TEE download proxy timeout).** The provider deployment
  template's reverse proxy times out before the 90 MB LoRA finishes
  streaming. Confirmed by 0G; fixes (proxy timeout, range-based chunked
  download, macOS storage fallback) on the SDK roadmap. We avoid the path
  in production by downloading via 0G Storage natively (which is also
  faster); the TEE fallback is only used on macOS dev.
- **Bug #8 (FT provider models registry empties spontaneously) — DEFERRED.**
  Phase 2 pivot dropped fine-tune from the mint/train pipelines, so this
  bug no longer blocks Yap. Historical record: on 2026-05-08 ~08:03–11:52
  UTC the Galileo fine-tune provider `0xA02b95Aa…E31A09` (the only one on
  Galileo) transitioned from healthy to a state where `listService()`
  returns `models: []`; every subsequent `createTask` accepted task IDs
  but the provider marked them `progress: Failed` within ~10 minutes.
  Aristotle mainnet's lone FT provider `0x940b4a10…0B0d` was in the same
  state at the same time, so the bug spanned both networks. Reported to
  0G team via Telegram; tracking continues there for any team that needs
  fine-tune. Local mitigation (provider picker filtering on `models: []`)
  remains in `compute.ts` for any future caller. Reference task IDs:
  `d4e997f7-fce5-46c2-9485-8ebef1c38a39`,
  `92fa3fc6-40c2-4b91-8320-4c53f8b272e3`,
  `d41bd0f1-18cb-4c5b-bb35-942901750506`. Last successful run on the
  same wallet+provider before the regression: `61cd3fe8-…` at 08:03 UTC.
- **Mainnet deploy.** Galileo testnet path is live and verified; mainnet
  Aristotle (chainId 16661) deploy is gated on (1) two-key blast-radius
  separation for ZG_BROKER_KEY and ZG_RELAYER_KEY, (2) a recorded provider
  rotation ceremony if oracleKey needs to differ from testnet, (3) the
  same `FighterTrainer` deploy + env wiring documented in README §Deployed
  Addresses.

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

- **0G Compute fine-tune** — Phase 2 pivot dropped fine-tune from mint/train
  (the LoRA was never reloaded into inference, so the latency cost was
  pure UX drag). Yap now ships persona-as-INFT (spec-conformant per
  ERC-7857 "character definitions"). Re-introducing fine-tune is parked
  as a post-hackathon explore — the existing `lib/0g/compute.ts` wrapper
  + Bug #8 mitigation are kept in tree for future use.
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
