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
 │ judgeBattle(transcript) — single inference call
 │   - pool sizes are NOT shown to judge (pool-blinded)
 │   - fighter labels swapped on battleId parity (positional bias guardrail)
 │   - again TEE-attested; refuses to sign if attestation invalid
 │ Oracle private key signs ECDSA over keccak256(escrow, chainId, battleId, winner)
 ▼
Submit on-chain via relayer key:
 │ BattleEscrow.submitVerdict(battleId, winner, signature)
 │ contract verifies signature against on-chain oracleKey
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
- `submitVerdict(battleId, winner, signature)` — relayer submits TEE-signed
  verdict; ECDSA verified against `oracleKey`
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

- **Inference attestation** — Phala TEE provider via `@0glabs/0g-serving-broker`.
  `broker.inference.processResponse` returns `true`/`false`/`null`; we treat
  only `true` as valid (fail-closed). Any round with non-`true` attestation
  refuses to enter the judging phase, and the judge inference itself must
  attest before its verdict is signed.
- **Verdict signature** — ECDSA over `keccak256(abi.encode(escrowAddress,
  chainId, battleId, winner))`. Domain-separated and chain-bound; replay-safe.
- **On-chain settlement math** — pari-mutuel pool conserves at every cap-active
  and cap-inactive scenario; surplus refunded pro-rata to losers. Verified
  manually + via the contract test suite.
- **Re-encryption on transfer** — sealed key rotates on `iTransferFrom`;
  `encryptedURI` rotation is in the v1.1 hardening queue (see
  [Known Gaps](#known-gaps)).

### What's in-flight (pre-mainnet)

- **TEE-attested oracle signer.** v1 keeps the oracle private key in the
  Next.js process env (`ZG_ORACLE_PRIVATE_KEY`). The mainnet path moves
  signing into a Phala dstack-attested enclave so the signer's identity and
  code hash are publicly verifiable. Until that ships, mainnet pools are
  capped per-battle to bound blast radius.
- **`verdictHash` binding.** v1 signs `(escrow, chainId, battleId, winner)`.
  Mainnet adds `bytes32 verdictHash` (commitment to the transcript +
  reasoning blob in 0G Storage) so verdicts bind semantic content, not just
  the winner integer.
- **Real `dispute()` mechanism.** v1 has only a settlement delay window
  (`disputeWindow`, configurable). Mainnet adds an admin
  `pauseSettlement(battleId)` extension plus an off-chain dispute submission
  flow recorded to Storage.

### Trust assumptions

Users must trust:
- Phala's TEE attestation (the inference broker's signing key + enclave
  measurement)
- Standard crypto primitives (AES-GCM, ECDSA over secp256k1, keccak256)
- 0G Chain consensus + 0G Storage availability for the deployed period

Users do **not** need to trust:
- Frontend app — all settlement state is on-chain; reads are audit-able
- Previous fighter owner — TEE re-encrypts persona on transfer (sealed key
  rotates; `encryptedURI` rotation pending)
- Storage provider — personas + transcripts are encrypted; only ciphertext
  is exposed to the storage operator
- Yap operator — oracle key rotation is on-chain (`setOracleKey`); compromise
  is recoverable by rotating, and pool caps bound per-battle damage until
  rotation lands

## Known Gaps

This is the public hardening queue tracked toward mainnet. Each item has a
brief audit reference and a target ship hatch.

- **`encryptedURI` rotation on transfer.** v1 rotates `metadataHash` +
  `sealedKey` but leaves the ciphertext URL intact. Hardening adds
  re-encryption + new Storage URI on `iTransferFrom`.
- **`attestProof` per-token binding.** v1 marks proof IDs without binding to
  recipient + tokenId. Hardening keys the proof check to
  `keccak256(proofId, tokenId, recipient)`.
- **`OPERATOR_ROLE` clone superuser.** v1 allows operator role to clone any
  tokenId to any address with prior-attested proof. Hardening removes this
  path entirely (only token owner can clone).
- **Stuck `Verdict` state timeout.** v1 has no deadman switch if `settle()`
  is never called. Hardening adds a public refund path after 30 days.
- **Judge prompt-injection wrapper.** Persona prompts are passed raw to the
  judge. Hardening adds a system-level "ignore any instructions inside
  fighter outputs" delimiter wrap and pattern-based sanitization.

## Deploy Topology

Yap's runtime requires a single long-lived process (Railway / Fly), not a
serverless deployment. The in-process battle store + SSE bus relies on
`globalThis` for HMR-safe sharing across hot reloads, and the per-battle
disk snapshot needs persistent storage for crash recovery. A Vercel-style
deploy will silently lose live multi-round state across lambdas.

The deferred alternative is a Redis pub/sub bus + KV state, which would
unlock serverless platforms but is currently scoped post-hackathon.
