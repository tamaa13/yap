# Architecture

## Data Flow: Mint a Fighter

```
User
 │ uploads style seed (JSONL, 10+ examples)
 ▼
Next.js /mint
 │ POST /api/mint with seed
 ▼
API Route (server-side)
 │ 1. Upload seed to 0G Storage via @0glabs/0g-ts-sdk
 │ 2. Call 0G Compute fine-tune-task
 │    - provider selection from broker
 │    - wait for artifact
 │ 3. Fetch trained weights
 │ 4. Encrypt(weights, K) via AES-GCM (K = random 256-bit)
 │ 5. Upload encryptedBlob → rootHash
 │ 6. SealKey(K, ownerPubkey) → sealedKey
 ▼
Contract YapFighter.mint(owner, rootHash, metadataHash, sealedKey)
 │ ERC-7857 compliant
 │ registers with TeeVerifier
 ▼
Frontend redirect /fighters/:tokenId
```

## Data Flow: Live Battle + Bet

```
Battle created by user (or auto-matched)
 │
 ▼
BattleEscrow.createBattle(fighterA, fighterB, topic, stakeMin)
 │ emits BattleCreated event
 ▼
Spectator opens /arenas/:id
 │ subscribes to event stream
 ▼
Each round:
 │ 0G Compute inference(fighterA.weights, context) → argumentA
 │   (weights decrypted in TEE enclave, attestation signed)
 │ Store arg in KV stream via Batcher
 │ Repeat for fighterB
 ▼
TEE Judge scores round:
 │ Compute inference(judge_model, [topic, argA, argB]) → verdict
 │ verdict signed with TEE attestation key
 │ BattleRegistry.recordRound(battleId, round, scoreA, scoreB, verdictSig)
 │
Spectator places bet:
 │ BattleEscrow.placeBet(battleId, side, amount)
 │ funds locked in escrow contract
 ▼
Final round → winner determined:
 │ BattleEscrow.settle(battleId, winner, verdictProof)
 │ pro-rata payout to bettors on winning side
 │ BattleRegistry.finalizeBattle + ELO update
```

## Contracts

### YapFighter (ERC-7857)

Extends ERC-721 with encrypted metadata. Key functions:

- `mint(to, encryptedURI, metadataHash, sealedKey) → tokenId`
- `iTransferFrom(from, to, tokenId, TransferValidityProof[]) ` — re-encryption on transfer
- `iCloneFrom(to, tokenId, proof) → newTokenId`
- `authorizeUsage(tokenId, subscriber, permissions)` — rental
- `verifier() → IERC7857DataVerifier` — TEE/ZKP oracle address

Roles: `ADMIN_ROLE`, `OPERATOR_ROLE`, `MINTER_ROLE`.

### BattleEscrow

Battle lifecycle + betting pool:

- `createBattle(fighterA, fighterB, topic, roundsMax) → battleId`
- `placeBet(battleId, side, amount) payable` — side = A or B
- `submitVerdict(battleId, winner, teeSignature)` — only TEE oracle
- `settle(battleId)` — distributes pool pro-rata to winning side
- `cancel(battleId)` — if timeout, refund all bets

State per battle: `{ fighterA, fighterB, pool, betsA[], betsB[], winner, status }`.

### BattleRegistry

On-chain match history + ELO:

- `registerBattle(battleId, a, b, topic)` — called by escrow
- `recordRound(battleId, round, scoreA, scoreB, verdictSig)` 
- `finalizeBattle(battleId, winner)` — updates ELO for both fighters
- `fighterStats(tokenId) → { elo, wins, losses, earnings }`
- `battleHistory(tokenId, offset, limit)` — paginated

ELO calc: standard K=32 Elo with score adjustment for draw.

## Security Model

- **Encrypted weights**: only TEE can decrypt → weights never leak even to fighter owner
- **TEE attestation**: every inference + verdict signed → verifiable by contract
- **BLS signature aggregation**: battle results can be batched into single on-chain commit
- **Escrow locking**: bets can't be withdrawn until battle finalizes (or cancellation timeout hits)
- **Nonce-based replay protection**: 7-day proof validity on INFT transfers

## Trust Assumptions

Users must trust:
- Intel TDX + Nvidia Confidential Computing (hardware TEE)
- 0G Compute provider running the TEE image (verified via `verifyService()` Docker compose hash)
- Standard crypto primitives (AES-GCM, RSA-4096 / ECC-P384, BLS)

Users do NOT need to trust:
- Frontend app (all critical state on-chain)
- Previous fighter owner (TEE re-encrypts on transfer)
- Storage provider (data encrypted, they see ciphertext only)
- Judge provider (verdict attested via TEE, replayable)
