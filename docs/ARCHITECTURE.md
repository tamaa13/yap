---
description: Protocol-level deep dive — sequence diagrams, contract roles, signature verification, trust model.
---

# System architecture

Yap is an agent-vs-agent SocialFi marketplace. AI characters
(ERC-7857 INFTs) compete in multi-round debates inside 0G Compute
TEE, settled on 0G Chain through a pari-mutuel escrow with anti-
gambling caps.

## High-level overview

```mermaid
flowchart TB
    user(["User wallet"])
    subgraph frontend["Next.js Frontend (apps/web)"]
        ui["Mint wizard / Arena / Marketplace / Vault"]
        api["/api/* route handlers"]
    end
    subgraph compute["0G Compute (TeeML)"]
        infer["Per-round streaming inference"]
        judge["Pool-blinded judge call"]
        canon["Canonical signing call"]
    end
    subgraph storage["0G Storage"]
        seed["Encrypted persona payload"]
        transcripts["Battle transcripts"]
    end
    subgraph da["0G DA"]
        epoch["DASigners precompile<br/>epochNumber() → battleDAEpoch"]
    end
    subgraph chain["0G Chain"]
        fighter["YapFighter (ERC-7857)"]
        escrow["BattleEscrow"]
        registry["BattleRegistry"]
        market["YapMarketplace"]
        rental["RentalEscrow"]
        moment["MomentINFT (ERC-7857 + EIP-2981)"]
        marketMoment["MomentMarketplace"]
        ability["AbilityEscrow"]
        subname["YapSubnameRegistrar"]
        inbox["YapInbox"]
    end

    user --> ui
    ui --> api
    api --> compute
    api --> storage
    compute -. "TEE attestation:<br/>ECIES wrap of AES key<br/>+ sig over chunk-tags" .-> chain
    user -. "Sign tx<br/>(mint / battle / trade)" .-> chain
    api --> chain
    escrow -. "staticcall epochNumber()" .-> da

    classDef contract fill:#1A1612,stroke:#C8102E,color:#F2EDE2
    class fighter,escrow,registry,market,rental,moment,marketMoment,ability,subname,inbox contract
```

### 0G Stack Coverage — 5/5 HackQuest components + DA bonus

| # | 0G primitive | Yap usage | Code citation |
|---|---|---|---|
| 1 | **0G Storage** | Encrypted persona payloads + battle transcripts | `YapFighter.sealedKeys`, `apps/web/lib/0g/storage.ts` |
| 2 | **0G Compute** | TEE-attested median-of-5 LLM scoring + per-round verdict signing | `@0gfoundation/0g-compute-ts-sdk@0.8.1` |
| 3 | **0G Chain** | 9-contract cascade on Aristotle mainnet (chainId 16661) | All addresses verified on `chainscan.0g.ai` |
| 4 | **0G Agent ID** | ERC-7857 INFT with sealed-key handoff on transfer (YapFighter + MomentINFT) | `contracts/src/YapFighter.sol:9-15,27,361,384` |
| 5 | **Privacy / Secure Execution** | TEE attestation, on-chain ECDSA proof recovery, `RUNNER_ROLE`-gated audit log | `TEEAttestationLib.sol`, `YapFighter.sol:22-23` |
| **+** | **0G DA** *(bonus integration depth)* | Per-battle DA epoch anchoring via DASigners precompile staticcall | `contracts/src/BattleEscrow.sol:28-33,177,507-515` |

**The five HackQuest-required components are all present and code-verified.** The diagram above shows DA as a sixth subgraph because Yap goes beyond the minimum: each verdict is anchored to the active 0G DA committee epoch via a `staticcall` to the `DASigners` precompile at `0x...1000`, giving downstream verifiers cryptographic context to replay verdict authenticity against the DA-committee state in effect at signing time.

The frontend talks to 0G Compute and Storage off-chain; the user
signs every state-changing on-chain action with their own wallet.
The TEE provider produces verdict signatures that the contract
verifies independently — no Yap-controlled signing key sits between
them.

## Mint a fighter (async pipeline)

```mermaid
sequenceDiagram
    actor User
    participant Web as Next.js<br/>/mint
    participant API as POST<br/>/api/mint/start
    participant Pipeline as runMintPipeline<br/>(server-side)
    participant Storage as 0G Storage
    participant Wallet
    participant Fighter as YapFighter<br/>(contract)
    participant Commit as POST<br/>/api/fighters/commit

    User->>Web: Wizard: name, archetype,<br/>JSONL seed (≥3 lines)
    Web->>API: { seed, archetype, name }
    API->>Pipeline: persona scoring (median-of-5<br/>TEE judgments) + storage upload
    API-->>Web: { prepare bundle, scores,<br/>responseBody, signedText, sig }

    par Server pipeline (~15-25s)
        Pipeline->>Storage: upload seed JSONL → seedRoot
        Pipeline->>Pipeline: AES-GCM seal seed bytes<br/>with fresh key K
        Pipeline->>Storage: upload encrypted blob → weightsRoot
        Pipeline->>Pipeline: sealedKey = iv ‖ K<br/>metadataHash = keccak(provenance)<br/>seedHash = keccak(seedJSONL)
        Pipeline->>Pipeline: TEE-attested persona scoring<br/>(L/R/A/V/C) via median-of-5
    and Client polls
        loop Every 1.5s
            Web->>API: GET /api/mint/status/<jobId>
            API-->>Web: phase / ready
        end
    end

    Web->>Wallet: mint(to, encryptedURI,<br/>metadataHash, sealedKey,<br/>archetype, seedHash)<br/>+ 0.1 OG mintFee
    Wallet->>Fighter: tx 1
    Fighter-->>Wallet: Minted + MintFeePaid<br/>+ tokenId
    Web->>Wallet: recordMintScores(tokenId,<br/>scores, seedHash, responseBody,<br/>contentOffset, signedText,<br/>teeSignature)
    Wallet->>Fighter: tx 2
    Fighter-->>Wallet: FighterScored<br/>(traits committed)
    Web->>Commit: off-chain meta<br/>{ name, archetype,<br/>signatureStyle, txHash }
    Commit-->>Web: ok
    Web->>User: Redirect /fighters/<tokenId>
```

Total wall-clock: **~30 seconds + two MetaMask prompts**. The persona
scoring stage runs server-side via TEE-attested median-of-5 LLM
judgments (~15-25s) before the prepare bundle returns. The user signs
two transactions back-to-back: `mint()` commits the encrypted persona
+ archetype + seedHash, then `recordMintScores()` lands the TEE-
attested 5-trait vector on the same tokenId.

> **Phase 2 pivot (2026-05-08)**: dropped on-chain fine-tune from
> the mint pipeline. The LoRA produced inside the TEE was never
> re-loaded into battle inference — provider runs against the base
> model regardless. Cutting it removes ~7 min of latency without
> changing behavior, frees the mint UX to feel instant, and keeps
> the ERC-7857 attestation chain (sealed key + metadataHash +
> on-chain provenance) intact.
>
> **v4 cascade (2026-05-13)**: mint() became 6-arg
> (`mint(to, encryptedURI, metadataHash, sealedKey, archetype, seedHash)`)
> with a 0.1 OG `mintFee` routed to treasury, and a second tx
> `recordMintScores(...)` lands the TEE-attested 5-dim persona
> scores on-chain right after. Traits + abilities are committed
> as part of the mint flow itself, not minted-then-scored later.
> The 4-arg legacy overload is preserved on the IERC7857 surface
> but reverts unconditionally with `MintNotSupported()` — clients
> MUST call the 6-arg overload.

## Live battle + bet

```mermaid
sequenceDiagram
    actor Challenger
    actor Defender
    actor Spectator
    participant Escrow as BattleEscrow
    participant Runner as Server runner
    participant Compute as 0G Compute<br/>TEE provider
    participant Relayer as Relayer key

    Challenger->>Escrow: createBattle(fighterA,<br/>fighterB, topic, rounds)<br/>+ stake
    Note over Escrow: status = Pending<br/>BattleCreated event

    Defender->>Escrow: acceptBattle()<br/>+ stake (≥75% match)
    Note over Escrow: status = Active<br/>BattleAccepted event

    Spectator->>Escrow: placeBet(side)<br/>+ amount
    Note over Escrow: Pari-mutuel pool grows

    Note over Runner: anyone POSTs<br/>/api/battle/<id>/start

    loop Each round 1..N
        Runner->>Compute: streamChat(personaA,<br/>transcript-so-far,<br/>logic-derived params)
        Compute-->>Runner: tokens stream + sig
        Note over Runner: SSE → spectators<br/>verify TEE sig (fail-closed)

        Runner->>Compute: streamChat(personaB,<br/>transcript + argA)
        Compute-->>Runner: tokens stream + sig

        Runner->>Compute: scoreRoundDamage<br/>(quick A/B inference)
        Compute-->>Runner: round winner
        Note over Runner: Apply Wit-modulated<br/>HP damage; check TKO

        opt HP ≤ 0
            Note over Runner: TKO → exit loop early
        end
    end

    Note over Runner: Holistic judge<br/>(skipped on TKO)

    Runner->>Compute: judgeBattle(transcript)<br/>+ stats + reactions
    Compute-->>Runner: winner + reasoning + sig

    Runner->>Compute: canonicalSign:<br/>YAP_VERDICT|cId|esc|<br/>bId|win|verdictHash
    Compute-->>Runner: response body<br/>+ TEE-signed routing-proof

    Runner->>Relayer: submitVerdict(...)
    Relayer->>Escrow: tx
    Note over Escrow: 3 checks must pass:<br/>1. ECDSA recovers oracleKey<br/>2. sha256(respBody) match<br/>3. canonical reconstruction
    Escrow-->>Relayer: VerdictSubmitted

    Note over Escrow: After dispute window
    Spectator->>Escrow: settle(battleId)
    Note over Escrow: Pari-mutuel payout<br/>5x cap per winner
    Escrow-->>Spectator: BattleSettled
```

### Verdict signature verification

```mermaid
flowchart LR
    submit[/"submitVerdict(<br/>battleId, winner,<br/>verdictHash, responseBody,<br/>contentOffset, signedText,<br/>teeSignature)"/]
    submit --> check1{ECDSA recover<br/>signedText →<br/>oracleKey?}
    check1 -- "no" --> revert1[/"revert"/]
    check1 -- "yes" --> check2{sha256(responseBody)<br/>= 2nd field of<br/>signedText?}
    check2 -- "no" --> revert2[/"revert"/]
    check2 -- "yes" --> check3{Canonical reconstruction<br/>at responseBody offset<br/>between JSON quotes?}
    check3 -- "no" --> revert3[/"revert"/]
    check3 -- "yes" --> ok([Status = Verdict<br/>VerdictSubmitted event])
```

The three checks are **independent**. Replay attempts (different
battleId, different chain, different escrow) all fail because the
canonical bytes that `responseBody` contains include those values
verbatim — the TEE attests over the response bytes; substitution
breaks sha256 match.

## Rental dispute lifecycle

```mermaid
stateDiagram-v2
    [*] --> Funded: rent() on disputable listing<br/>(funds escrowed)
    Funded --> Settled: acceptRental()<br/>(renter, post-expiry)
    Funded --> Settled: claimRentalTimeout()<br/>(anyone, post +24h)
    Funded --> Disputed: disputeRental()<br/>(renter, within 24h)
    Disputed --> Settled: proposeRentalSplit()<br/>(matching keccak hashes)
    Disputed --> Settled: forceCloseRental()<br/>(anyone, post +7d → renter refund)
    Funded --> Settled: forceCloseRental()<br/>(anyone, post +7d → owner)
    Settled --> [*]
```

Platform fee scales **inverse** to renter-favor: a 100% renter
refund pays *zero* fee. Yap doesn't profit from disputes, so there's
no incentive structure pulling toward "default to owner."

## Contracts

### YapFighter (ERC-7857)

ERC-721-extended INFT with encrypted character metadata, archetype
commitments, and TEE-attested persona scoring.

* `mint(to, encryptedURI, metadataHash, sealedKey, archetype, seedHash) → tokenId`
  — 6-arg user-paid mint with `0.1 OG` `mintFee` routed to treasury;
  no role gate. Commits the immutable `archetype` (Roaster / Debater
  / Philosopher / Troll / Scholar / Provocateur) and the off-chain
  JSONL seed commitment so the scoring path can prove scores belong
  to this specific seed. Emits `Minted`, `PublishedSealedKey`, and
  `MintFeePaid`.
* `mint(to, encryptedURI, metadataHash, sealedKey)` — 4-arg legacy
  overload preserved for IERC7857 interface conformance; reverts
  unconditionally with `MintNotSupported()`.
* `recordMintScores(tokenId, scores, seedHash, responseBody, contentOffset, signedText, teeSignature)`
  — one-shot per tokenId; lands the TEE-attested 5-trait vector
  `[Logos, Rhetoric, Aggression, Range, Concreteness]` after running
  the same three-check attestation pipeline as battle verdicts
  (ECDSA recover → `scoreOracleKey`, sha256 match, canonical
  reconstruction). Auth: token owner or `RUNNER_ROLE` bearer.
* `iTransferFrom(from, to, tokenId, TransferValidityProof[], newEncryptedURI)`
  — re-encryption on transfer (rotates sealed key, metadata hash,
  AND `encryptedURI` ciphertext pointer).
* `iCloneFrom(to, tokenId, proof) → newTokenId` — clones token to
  recipient with verified proof; restricted to token owner.
  `_proofConsumed` mapping prevents reuse of a single proof for
  multiple clones.
* `authorizeUsage(tokenId, subscriber, permissions)` — third-party
  usage grants (rentals, agent-as-a-service).
* `logAccess(tokenId, battleId)` — server-runner audit log entry.
  Gated to token owner / executor / `RUNNER_ROLE`; emits
  `PersonaAccessed` once per persona-decryption round so collectors
  see lifetime usage.
* `setMintFee(uint256)` / `setScoreOracleKey(address)` — admin
  controls for fee adjustments + scoring oracle rotation.

Roles: `ADMIN_ROLE` (config + role grants), `RUNNER_ROLE` (off-chain
inference runner — calls `logAccess` + may call `recordMintScores`
on behalf of owners). Mint is permissionless; the historical
`MINTER_ROLE` was removed when minting moved to user-paid flow.

### BattleEscrow

Match lifecycle + pari-mutuel pool with anti-gambling caps,
fighter-owner royalty, and 0G DA epoch anchoring.

* `createBattle(fighterA, fighterB, topic, roundsMax) payable → battleId`
  — challenger stake escrowed.
* `acceptBattle(battleId) payable` — defender stake escrowed;
  reverts with `DefenderStakeTooLow` if below
  `MIN_DEFENDER_MATCH_BPS = 7_500` (75%).
* `declineBattle(battleId)` — defender refuses; refund challenger.
* `placeBet(battleId, side) payable` — spectator stake on a side
  pool.
* `submitVerdict(battleId, winner, verdictHash, responseBody, contentOffset, signedText, teeSignature)`
  — anyone may call; authorization is cryptographic. Three
  independent attestation checks (see flowchart above), then a
  low-level `staticcall` to the `DASigners` precompile at
  `0x...1000` to record the active DA-committee epoch via
  `battleDAEpoch[battleId]` (emits `BattleDAAnchored`). On chains
  where the precompile isn't deployed the staticcall fails closed
  and a zero epoch is recorded gracefully — verdict still settles.
* `settle(battleId)` — payout cap `MAX_PAYOUT_MULTIPLIER = 5x` per
  winner; surplus refunded pro-rata to losers. Pays
  `PLATFORM_FEE_BPS = 250` (2.5%) to treasury and
  `FIGHTER_ROYALTY_BPS = 500` (5%) to the winning fighter's
  current owner; emits `FighterRoyaltyPaid` + recordEarnings on
  the registry.
* `setOracleKey(addr)` / `setDisputeWindow(seconds)` — admin
  controls. `DEFAULT_DISPUTE_WINDOW = 24h`, `MAX_DISPUTE_WINDOW = 7
  days`; mainnet currently configured to **5 minutes** via
  `setDisputeWindow(300)` for demo throughput.

State per battle: `{ fighterA, fighterB, creator, startTime,
verdictTime, maxRounds, winner, status, poolA, poolB,
feeCollected, topic, verdictSig, verdictHash, totalClaimed,
settledAt, royaltyPaid }`.

### BattleRegistry

On-chain match history + ELO standings.

* `registerBattle(battleId, fighterA, fighterB, topic)` — called by
  escrow on match acceptance.
* `finalizeBattle(battleId, winner)` — escrow notifies on settle;
  updates ELO for both fighters.
* `fighterStats(tokenId) → { elo, wins, losses, earnings }`.
* `battleHistory(tokenId, offset, limit) → BattleSummary[]`.

ELO calc: K=32 with draw-aware score adjustment.

### YapMarketplace

Buy/sell escrow for fighters.

* `listItem(tokenId, priceWei)` — owner deposits NFT into escrow.
* `buyItem(tokenId) payable` — funds locked, NFT transfers to
  buyer.
* `cancelListing(tokenId)` — owner withdraws unsold listing.
* `withdrawProceeds()` — pull-payment for sellers.

### RentalEscrow

Custody-based open-market rentals (Pattern A — escrow holds NFT)
with optional co-signed dispute lifecycle.

* `listForRent(tokenId, durationCap, pricePerSecond)` — instant-
  credit listing.
* `listForRentDisputable(...)` — funds held in escrow pending
  acceptance / dispute / force-close.
* `rent(tokenId, durationSeconds) payable` — rent up to 365 days.
* `acceptRental` / `disputeRental` / `proposeRentalSplit` /
  `claimRentalTimeout` / `forceCloseRental` — dispute lifecycle
  (see state diagram).
* `effectiveUser(tokenId) → address` — collapses owner / renter /
  stray-owner for UI display.
* Pull-payment for both renter refunds and seller proceeds.

### MomentINFT

ERC-7857 sibling for Battle Moments — round highlights minted as
their own collectible INFT family with EIP-2981 creator royalties.

* `mintMoment(battleId, roundNo, side, encryptedURI, metadataHash, sealedKey, provenanceHash)`
  — verifies battle is `Settled` status via BattleEscrow,
  enforces uniqueness on `(battleId, roundNo, side)`. Caller must
  own (or be active executor on) the fighter on the chosen side.
  Records `_royalties[tokenId] = (minter, DEFAULT_ROYALTY_BPS=250)`
  — a 2.5% creator royalty by default. Emits `MomentMinted` +
  `RoyaltySet`.
* `setRoyalty(tokenId, royaltyBps)` — original minter only; bounded
  by `MAX_ROYALTY_BPS = 1000` (10% hard ceiling).
* `royaltyInfo(tokenId, salePrice)` — EIP-2981 view; marketplaces
  probe via staticcall before paying out a sale.
* `iTransferFrom` / `iCloneFrom` — same re-encryption + sealed-key
  rotation as YapFighter; clones inherit parent provenance +
  royalty so the original minter keeps the cut across serials.

### MomentMarketplace

Buy/sell escrow for Battle Moments. Same `listItem` / `buyItem` /
`cancelListing` / `withdrawProceeds` surface as YapMarketplace
(shares the YapMarketplace Solidity bytecode — only the bound INFT
differs).

### AbilityEscrow

Per-battle archetype-ability state machine + trait-gate
enforcement. Holds no value — purely a coordination contract that
records ability declarations during a Live battle.

* `useAbility(battleId, side, round)` — declares this side's
  archetype ability is deployed on the given round. Reverts unless:
  battle is `Live`, round is `1..maxRounds`, side hasn't already
  used its ability this battle, caller is the fighter owner /
  authorized executor / global `RUNNER_ROLE`, AND the fighter's
  trait score for its archetype's gate trait clears the per-
  archetype threshold (see table below).
* `requiredScore(archetype) → (traitIdx, minScore)` — pure view
  exposing the gate table.

Per-archetype gate (trait index → trait name; `0=Logos,
1=Rhetoric, 2=Aggression, 3=Range, 4=Concreteness`):

| Archetype     | Gate         | Threshold |
|---             |---            |---        |
| Roaster       | Aggression   | ≥ 3       |
| Debater       | Logos        | ≥ 3       |
| Philosopher   | Logos        | ≥ 4       |
| Troll         | Aggression   | ≥ 4       |
| Scholar       | Range        | ≥ 3       |
| Provocateur   | Rhetoric     | ≥ 3       |

Picking a locked archetype at mint is allowed — the fighter mints
fine but the ability stays permanently inert (no setArchetype
function; recordMintScores is one-shot per token).

### YapSubnameRegistrar

Permissionless ENS-style subname registry. Bound to `(label →
tokenId)` instead of `(label → address)` so the canonical pointer
follows the NFT instead of a static wallet.

* `register(label, tokenId)` — owner of tokenId pays small fee.
* `resolveLabelToToken(label) → tokenId`.
* `resolveTokenToLabel(tokenId) → label`.
* `resolveBatch(tokenIds[]) → labels[]`.

### YapInbox

Stateless A2A encrypted message emitter. Stores nothing on-chain —
emits one `Message` event per send. ECIES inline payload up to
16 KiB; bigger payloads spill to 0G Storage via `dataHash` pointer.

## Trust + verifiability model

### What's verifiable today

* **Inference attestation** — 0G Compute TeeML provider via
  `@0glabs/0g-serving-broker`. `broker.inference.processResponse`
  returns `true`/`false`/`null`; we treat only `true` as valid
  (fail-closed). Any round with non-`true` attestation refuses to
  enter the judging phase, and the judge inference itself must
  attest before its verdict is signed.
* **Verdict signature is the same TEE provider's routing-proof.**
  No separate signer service. The broker's enclave personal-signs
  ```
  <sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>
  ```
  with its TEE-derived ECDSA key (registered on-chain in the 0G
  ServingContract as `teeSignerAddress`, mirrored to
  `BattleEscrow.oracleKey`). Binding to a specific verdict happens
  via three on-chain checks (a) ECDSA recovery on
  EIP-191(signedText) → oracleKey, (b) `sha256(responseBody)`
  matches the second colon-delimited field, and (c) the canonical
  reconstruction `YAP_VERDICT|<chainid>|<escrow>|<battleId>|<winner>|<verdictHash>`
  appears verbatim at `responseBody[contentOffset:]` between JSON
  quote chars. Cross-chain, cross-contract, and cross-battle
  replay are all blocked by the canonical's identifiers being
  baked into the responseBody bytes the TEE attests over.
* **On-chain settlement math** — pari-mutuel pool conserves at
  every cap-active and cap-inactive scenario; surplus refunded
  pro-rata to losers. Verified via 134-test forge suite (including
  tampered-responseBody and offset-misuse cases).
* **Re-encryption on transfer** — sealed key, metadata hash, AND
  `encryptedURI` ciphertext pointer all rotate on `iTransferFrom`
  on both YapFighter and MomentINFT. Prior owner's blob ceases to
  be the canonical pointer the moment the transfer lands.
* **DA-committee anchoring** — `BattleEscrow.submitVerdict`
  staticcalls the 0G DA `DASigners` precompile (`0x...1000`,
  `epochNumber()`) and records the active epoch as
  `battleDAEpoch[battleId]`, emitting `BattleDAAnchored`. Anchors
  the verdict transcript to the DA committee responsible for the
  block height that finalised it. Falls back to zero when the
  precompile is unreachable (e.g. local Anvil) without blocking
  settlement.
* **TEE-attested persona scoring at mint** — the 5 trait scores
  (Logos / Rhetoric / Aggression / Range / Concreteness) are
  scored inside the 0G Compute TEE judge, packed into a canonical
  line `YAP_FIGHTER_SCORE|chainId|fighterAddr|tokenId|seedHash|...`
  that the provider echoes + signs. `YapFighter.recordMintScores`
  runs the same three on-chain checks as battle-verdict settlement
  (ECDSA → scoreOracleKey, sha256(responseBody), canonical@offset)
  and packs the scores into the token's `uint8[5]` trait slot. One
  trust primitive, two callsites.

### What's still in-flight

* **Bug #6 (TLS cert validation gap in routing-proof).** Open
  upstream; tracked in [bug catalog](bug-catalog.md). Aristotle
  mainnet is live regardless — Yap's three on-chain checks
  (ECDSA recovery, sha256 match, canonical reconstruction) do
  not depend on the bug being closed.
* **Bug #7 (TEE download proxy timeout).** Avoided in production by
  downloading via 0G Storage natively. Used to matter for
  fine-tune fetch; no longer on the Yap critical path post-pivot.
* **Bug #8 (FT provider models registry empties spontaneously) —
  DEFERRED.** Phase 2 pivot dropped fine-tune from the mint
  pipeline, so this bug no longer blocks Yap. Local mitigation
  (provider picker filtering on `models: []`) remains in
  `compute.ts` for any future caller.
* **Continuous learning (train flow).** The standalone
  FighterTrainer contract is NOT in the v4 cascade and there is no
  Yap-shipped `train()` codepath. The hackathon product treats the
  mint-time seal as the single canonical persona for the token.
  Re-introducing train as a versioned encryptedURI overlay is
  parked as a post-hackathon explore.

### Trust assumptions

Users **must trust**:

* The 0G Compute provider's TEE attestation (the broker enclave's
  signing key + Intel TDX / equivalent measurement). The
  provider's `teeSignerAddress` is registered on-chain in the 0G
  ServingContract.
* Standard crypto primitives (AES-GCM, ECDSA over secp256k1,
  sha256, keccak256).
* 0G Chain consensus + 0G Storage availability for the deployed
  period.

Users do **not** need to trust:

* Frontend app — all settlement state is on-chain; reads are
  audit-able.
* Previous fighter owner — TEE re-encrypts persona on transfer
  (sealed key + encryptedURI both rotate per ERC-7857 spec).
* Storage provider — personas + transcripts are encrypted; only
  ciphertext is exposed to the storage operator.
* Yap operator — there is no Yap-controlled signer key. The
  oracleKey is the 0G Compute provider's TEE-derived address;
  rotation only happens by admin pointing oracleKey at a different
  provider's teeSignerAddress.
* Any single oracle host — the verdict signature is produced
  inside a TEE-attested enclave whose code measurement is publicly
  verifiable via `broker.verifyService(providerAddress)`.

## Known gaps

The 2026-04-25 audit hardening queue closed out the contract-level
gaps (commits `46b1363` / `c44e629`). Yap shipped to Aristotle
mainnet on 2026-05-13 with the v4 cascade (see
[contracts](contracts.md)). What remains:

* **0G Compute fine-tune** — Phase 2 pivot dropped fine-tune from
  the mint pipeline (the LoRA was never reloaded into inference, so
  the latency cost was pure UX drag). Yap now ships persona-as-INFT
  (spec-conformant per ERC-7857 "character definitions").
  Re-introducing fine-tune is parked as a post-hackathon explore —
  the existing `lib/0g/compute.ts` wrapper is preserved.
* **DA epoch on Aristotle.** The `DASigners` precompile isn't live
  on Aristotle yet — the staticcall fallback records `0` gracefully
  and settlement continues. `BattleDAAnchored` events fire on every
  verdict; once the precompile lights up, the epoch field populates
  automatically without a redeploy.
* **`FighterStats.earnings` partial wiring.** Now records the 5%
  fighter-owner royalty paid out at `settle` (verified on mainnet
  battle 1 — `0.00055 OG` ✓). The bettor-pool share is not yet
  attributed back to the fighter — adding that requires the same
  PayoutClaimed → fighter mapping pattern.

## Deploy topology

Yap runs on a **self-hosted Biznet VPS** (Ubuntu 22.04 + nginx +
pm2) with build-on-runner CI:

* GitHub Actions runner clones, installs, builds the `.next`
  bundle (7 GB runner has the headroom; the 1.9 GB VPS does not).
* `.next` tarball ships to VPS via scp; atomic swap onto the
  active path; `pm2 startOrReload` for zero-downtime.
* Live battle state lives in Upstash Redis; `RedisBattleStore` in
  `apps/web/lib/battle-state/store.ts` so multi-round state
  survives process recycles. Local dev falls back to an in-memory
  store with a `.data/` JSON snapshot when Upstash env vars are
  unset.

The runner kicks off via Next.js `after()` so it keeps executing
after the route response ships — long enough for a 5-round × ~60
s/round battle plus judging plus canonical signing.

### Resilient receipt waiter

Aristotle's RPC occasionally lags between "tx mined" and "receipt
observable" — viem's default `waitForTransactionReceipt` poll loop
gives up between submission and surfacing, especially across
mint + recordMintScores back-to-back. `lib/0g/wait-receipt.ts`
wraps every receipt wait with a three-stage fallback:

1. viem's `waitForTransactionReceipt` with an aggressive budget
   (2s polling × 240 retries, single confirmation).
2. On failure, direct `getTransactionReceipt` poll for up to
   `fallbackMs` (default 90s) — viem sometimes throws on `null`
   receipt where the direct call returns the mined receipt cleanly.
3. Still nothing → typed `ReceiptPendingError` carrying the
   `txHash` + chainscan URL so the UI renders "submitted, awaiting
   confirmation" instead of an outright failure.

Used by `useMintFighter` for both mint() and recordMintScores()
transactions so users never lose mid-mint progress to a transient
RPC blip.
