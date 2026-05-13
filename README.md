# Yap

[![Slither](https://github.com/tamaa13/yap/actions/workflows/slither.yml/badge.svg?branch=main)](https://github.com/tamaa13/yap/actions/workflows/slither.yml)

**Verifiable AI combat arena where each fighter is an ERC-7857 character INFT and every verdict is TEE-attested on-chain. No off-stack signer service.**

Each fighter is an **ERC-7857 character INFT**: an encrypted persona definition the owner seeds and re-seals over time, packaged as the INFT's encrypted payload. Owners can:
- **Mint** new fighters from a JSONL style seed in about five seconds — encrypted persona pinned on 0G Storage, sealed key + metadata committed on-chain.
- **Train** existing fighters incrementally — each session re-seals the persona with new style lines and emits a `FighterTrained` event so the evolution timeline is independently auditable.
- **Battle** their fighters head-to-head via 0G Compute TeeML inference, with the provider both judging and signing the verdict via routing-proof attestation.
- **Rent** them out via `authorizeUsage`, or **sell** on the marketplace.

The result is a complete agentic-economy primitive: agents as **assets** (INFT), **services** (rentals), **participants** (autonomous battle execution), **price-discovery** (skill rankings via on-chain ELO), and **evolving entities** (continuous re-sealing). Every layer of the 0G stack does real work — Storage holds encrypted persona payloads, Compute runs the inference *and* signs verdicts, Chain settles every economy event, and ERC-7857 makes the character itself a transferable asset.

**Yap is not a betting dApp.** It is the consumer surface for an agent economy where reputation is provable, skill is monetizable, and AI character growth is verifiable.

Built on [0G](https://0g.ai) for the [0G APAC Hackathon 2026](https://www.hackquest.io/hackathons/0G-APAC-Hackathon).

---

> Voice & UI guide: [`apps/web/STYLE.md`](apps/web/STYLE.md) — voice anchor, forbidden phrases, before/after table.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), TypeScript, RainbowKit + wagmi |
| Smart Contracts | Solidity 0.8.24, Foundry, `--evm-version cancun` |
| Storage | 0G Storage via `@0gfoundation/0g-ts-sdk@1.2.6` (pnpm-patched for zero-copy MemData) |
| Compute | 0G Compute (TeeML) via `@0gfoundation/0g-compute-ts-sdk@0.8.1` (pnpm-patched for ESM Wallet identity) |
| Chain | 0G Aristotle mainnet (16661) + Galileo testnet (16602) |
| Hosting | Self-hosted Biznet VPS (Ubuntu 22.04 + nginx + pm2) |
| CI/CD | GitHub Actions → SSH deploy + pm2 reload |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Next.js Frontend (apps/web)                                      │
│  - Mint wizard + async polling (/api/mint/start → /status/<id>)  │
│  - Train modal: continuous-learning seed extension               │
│  - Live battle arena, betting, marketplace, rentals              │
└─────┬────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────┬────────────────────────────────────────┐
│ 0G Compute (TeeML)      │ 0G Storage                             │
│ ─ Per-round inference   │ ─ Encrypted persona payload (mint+train)│
│ ─ Pool-blinded judge    │ ─ Battle transcripts                   │
│ ─ Routing-proof verdict │                                        │
│   signature (TEE-bound) │                                        │
└─────┬───────────────────┴────────────────────────────────────────┘
      │ TEE attestation (ECIES wrap of AES key + sig over chunk-tags)
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ 0G Chain (contracts/)                                            │
│  ┌────────────────┐ ┌──────────────────┐ ┌────────────────────┐  │
│  │ YapFighter     │ │ FighterTrainer   │ │ BattleEscrow       │  │
│  │ ERC-7857 INFT  │ │ Continuous-learn │ │ Pari-mutuel verdict│  │
│  │ mint()         │ │ train() event log│ │ + routing-proof vfy│  │
│  └────────────────┘ └──────────────────┘ └────────────────────┘  │
│  ┌────────────────┐ ┌──────────────────┐ ┌────────────────────┐  │
│  │ BattleRegistry │ │ YapMarketplace   │ │ RentalEscrow       │  │
│  │ ELO + history  │ │ Sale listings    │ │ authorizeUsage     │  │
│  └────────────────┘ └──────────────────┘ └────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Mint vs Train flow

**Mint (one-time per fighter):**
1. `POST /api/mint/start` → returns `jobId` in <2 s; pipeline runs server-side
2. Server: upload seed → AES-GCM seal the persona → upload encrypted blob to 0G Storage (~5 s end to end)
3. Client polls `/api/mint/status/<id>`; status drives the UI's phase indicator
4. Once `ready`, client signs `YapFighter.mint(...)` with the prepare payload
5. `Minted` event → fighter NFT lives on-chain

**Train (any time after mint):**
1. Owner adds new style lines on the fighter profile (e.g. lessons from a battle)
2. `POST /api/fighters/<tokenId>/train/start` validates ownership + runs the same prepare pipeline
3. Same async polling pattern as mint
4. Once `ready`, client signs `FighterTrainer.train(...)`
5. `FighterTrained(tokenId, sessionNumber, encryptedURI, ...)` event lands; the fighter's profile shows session N

The fighter's INFT itself is unchanged — `FighterTrainer` is purely additive. The fighter's "current persona" is the most recent `FighterTrained` event for that tokenId; the original mint URI is preserved as session 0.

## For Judges / Reviewers

Yap is live on 0G Aristotle mainnet. The fastest review path is on-chain verification — every contract action is auditable via chainscan with zero spend.

### Live demo
- URL: <https://yap-arena.xyz/>
- Network: 0G Aristotle (chainId `16661`, RPC `https://evmrpc.0g.ai`)
- Explorer: <https://chainscan.0g.ai>

### Read-only verification (no OG required)

Verify any of these on-chain commitments via `cast call` or chainscan:

- **YapFighter mintFee** (returns `100000000000000000` = 0.1 OG):
  ```
  cast call 0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b "mintFee()(uint256)" --rpc-url https://evmrpc.0g.ai
  ```
- **Sample fighter traits + archetype + scored flag** (replace `<TOKEN_ID>` with the canonical sample below):
  ```
  cast call 0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b "getTraits(uint256)(uint8[5])" <TOKEN_ID> --rpc-url https://evmrpc.0g.ai
  cast call 0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b "getArchetype(uint256)(uint8)" <TOKEN_ID> --rpc-url https://evmrpc.0g.ai
  cast call 0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b "isScored(uint256)(bool)" <TOKEN_ID> --rpc-url https://evmrpc.0g.ai
  ```
- **TEE oracle key** (the TEE-derived signer registered for verdict + score attestation):
  ```
  cast call 0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b "scoreOracleKey()(address)" --rpc-url https://evmrpc.0g.ai
  # → 0xd45b4301940B297F76d6e622c1CeA2AE660617d4 (qwen3.6-plus provider 0x992e6396…db5)
  ```

### Step-by-step app flow

The full user lifecycle, end-to-end:

**1. Mint a fighter** (~30s + 2 MetaMask prompts, total ~0.16 OG)
- Connect wallet → switch to Aristotle (chainId `16661`)
- Open `/mint` → paste persona seed text (free-form or JSONL)
- Click "Score Traits" → server-side 0G Compute TEE judge runs median-of-5 LLM judgment per dimension (Logos, Rhetoric, Aggression via `qwen3.6-plus`; Range via MTLD stylometric; Concreteness via Brysbaert ratings). 15 LLM calls + 1 canonical echo, ~15–25s wall time
- Scores resolve → archetype picker shows which abilities are unlocked given the scores
- Pick archetype (locked picks surface a "this fighter's ability stays permanently locked" confirm modal)
- Sign `mint()` tx — `msg.value=0.1 OG` mint fee routes to treasury, sealed key + metadataHash + seedHash + archetype commit on-chain
- Sign `recordMintScores()` tx — TEE attestation bundle (responseBody + canonical@offset + ECDSA signature) verifies on-chain against `scoreOracleKey`, traits packed into `uint8[5]`, `FighterScored` event emitted
- Fighter NFT appears in `/vault`. Encrypted persona pinned on 0G Storage; sealed key + commitments on 0G Chain
- **0G modules engaged**: Compute (TEE inference + verdict signing), Storage (encrypted persona pin), Chain (mint + score commit), INFT/ERC-7857 (encrypted metadata)

**2. Challenge another fighter** (1 MetaMask prompt, stake-dependent)
- Browse `/arenas` → find a fighter to challenge, or accept a pending challenge
- Set topic + maxRounds (1–7) + stake (any amount)
- Sign `createBattle()` tx — stake escrows into `BattleEscrow`, `BattleCreated` event fires
- Defender wallet gets a `challenge_incoming` bell-icon notification (via SSE stream that queries `BattleCreated` + `YapFighter.ownerOf(fighterB)` for each new event)
- Defender has 24h `CHALLENGE_EXPIRY` window to accept or decline
- Defender accepts → must stake ≥ 75% of challenger's stake (`MIN_DEFENDER_MATCH_BPS`). Battle transitions to `Status.Live`
- **0G modules engaged**: Chain (escrow + event emission), Storage (no new write at challenge — encrypted persona already pinned at mint)

**3. Live battle** (~3–5 min, autonomous)
- Battle runs server-side without owner intervention (autonomous AI fighters after the v4 pivot)
- Each round: 0G Compute TEE judge runs persona-driven inference per fighter, picks per-round winner, computes HP-morale impact
- Stance (ATTACK/BUILD) auto-derived by `decideStance(state, side, archetype)` heuristic — round 1 BUILD, claw-back ATTACK on HP < 50, consolidate BUILD on HP > 60, mid-late ATTACK, archetype default
- After `maxRounds` or TKO → verdict canonicalizes as `YAP_VERDICT|chainId|escrow|battleId|winner|verdictHash` + TEE provider echoes + signs the response body
- `VerdictSubmitted` tx: `BattleEscrow` verifies the same three checks as mint score — ECDSA recovery → `oracleKey`, `sha256(responseBody)` match, canonical reconstruction at offset
- **0G modules engaged**: Compute (per-round inference + verdict signing — same trust primitive as mint scoring), Chain (verdict commit), Storage (battle transcripts archived)

**4. Settle + payout** (1 MetaMask prompt, post-dispute-window)
- Result page opens dispute window countdown (5 minutes; lowered from 24h default for demo via `setDisputeWindow(300)`)
- During window, anyone can audit the verdict signature (recover ECDSA → registered oracleKey, confirm response body `sha256`, reconstruct canonical)
- After window expires, settle button enables
- Sign `settle()` tx — pari-mutuel pool distributes to winning side, 5% royalty (`FIGHTER_ROYALTY_BPS`) routes to winning fighter's owner, 2.5% platform fee (`PLATFORM_FEE_BPS`) routes to treasury
- Winning bettors call `claimPayout()` to pull individual share (capped at `MAX_PAYOUT_MULTIPLIER` = 5× own stake; surplus refunds losing side pro-rata)
- ELO updates in `BattleRegistry`
- **0G modules engaged**: Chain (settle + payout + ELO)

**5. Marketplace + rental + moments** (optional, ongoing)
- Sell fighter on `YapMarketplace` — list price, signature-based offer/accept flow
- Rent fighter via `RentalEscrow` — `authorizeUsage(executor, permissions)` grants temporary control, 24h dispute window post-expiry
- Mint Battle Moments (`MomentINFT`) — highlight-reel NFT of a specific battle round, sellable on `MomentMarketplace` with 5% royalty to fighter owner
- Claim a YapSubname — register a human-readable name for the fighter via `YapSubnameRegistrar`
- **0G modules engaged**: Chain (marketplace contracts), Storage (moment metadata)

Each step's contracts are listed in the address table below — every action is verifiable by following the linked chainscan.0g.ai entry.

### Live testing (requires 0G mainnet OG)

0G mainnet OG must be acquired via DEX (no mainnet faucet exists). Minimum spend for a full mint + battle + settle flow ≈ 0.3 OG. Reach out via X DM ([@tamaa13](https://x.com/tamaa13)) if a small bonus to a review wallet would help your evaluation.

### Sample mainnet fighter (canonical demo)

*TBD — populating after retroactive scoring of mainnet fighters #3 + #4 (recovery path lives at `/fighters/[tokenId]` Overview tab for owner-side commit).*

## Deployed Addresses

### Mainnet (Aristotle, chainId 16661) — canonical

| Contract | Address | Explorer |
|---|---|---|
| YapFighter (ERC-7857 + persona scoring + archetype commit + 0.1 OG mint fee) | `0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b` | [chainscan](https://chainscan.0g.ai/address/0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b) |
| BattleEscrow | `0x311ecf5B66Ab569Bcb4cB96e7b4085CA2b59b037` | [chainscan](https://chainscan.0g.ai/address/0x311ecf5B66Ab569Bcb4cB96e7b4085CA2b59b037) |
| BattleRegistry | `0xda4f5279e677576831Fb5d99f2C754D5407030ee` | [chainscan](https://chainscan.0g.ai/address/0xda4f5279e677576831Fb5d99f2C754D5407030ee) |
| YapMarketplace | `0xb20769dD18F1438CA0aDa66Adf9ba670Cab6b9B0` | [chainscan](https://chainscan.0g.ai/address/0xb20769dD18F1438CA0aDa66Adf9ba670Cab6b9B0) |
| RentalEscrow | `0x6b89A8E306E3E567598A6233F10D6c410da07eB8` | [chainscan](https://chainscan.0g.ai/address/0x6b89A8E306E3E567598A6233F10D6c410da07eB8) |
| MomentINFT | `0x42C85f0EAa8Aef98c0ec1057e6c241769861A1aF` | [chainscan](https://chainscan.0g.ai/address/0x42C85f0EAa8Aef98c0ec1057e6c241769861A1aF) |
| MomentMarketplace | `0x0514c5F6a9b7a57d329f41125C9E84C805F3Be7c` | [chainscan](https://chainscan.0g.ai/address/0x0514c5F6a9b7a57d329f41125C9E84C805F3Be7c) |
| YapSubnameRegistrar | `0x4aC6E562b1b3CF9B2c0B6A3789200E889eD7576d` | [chainscan](https://chainscan.0g.ai/address/0x4aC6E562b1b3CF9B2c0B6A3789200E889eD7576d) |
| AbilityEscrow | `0x07E47975Aac222B0D82DB8b5f5A6a24Fd87C7148` | [chainscan](https://chainscan.0g.ai/address/0x07E47975Aac222B0D82DB8b5f5A6a24Fd87C7148) |
| YapInbox | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` | [chainscan](https://chainscan.0g.ai/address/0xe92dB21A770c32a19795556C46D5c6a274955DBD) |

> v4 cascade deployed **2026-05-13**. YapFighter now charges a `mintFee` (0.1 OG) on `mint()` — fee accrues to treasury. Only YapInbox carries over from v3; previous v3 addresses are preserved in `docs/contracts.md` for tx-history lookups.

`oracleKey` + `scoreOracleKey` both = `0xd45b4301940B297F76d6e622c1CeA2AE660617d4` — the TEE-derived signing address registered by 0G Compute provider `0x992e6396157Dc4f22E74F2231235D7DE62696db5` running `qwen3.6-plus`. Same signer attests battle verdicts AND mint-time persona scores — one trust assumption, two callsites.

Runner role (server-side `logAccess` per inference round): `0xe5e0bf763be8CF6a7BBA1B18Fa5Ca110b0587fdC` granted `RUNNER_ROLE` on YapFighter at deploy.

### Testnet (Galileo, chainId 16602) — historical reference

Mainnet supersedes testnet as of **2026-05-13**. Testnet ecosystem is preserved but not actively maintained. See [`docs/contracts.md`](docs/contracts.md) for the full testnet address table.

## 0G Modules Used

1. **INFT / ERC-7857** — every fighter is an ERC-7857 *character INFT*: encrypted persona definition + on-chain `traitsRoot` seed. Transferable via TEE-attested re-encryption; rentable via `authorizeUsage`; tradeable on-chain.
2. **0G Storage** — encrypted persona payloads (mint *and* every train session) + battle transcripts. Uploads via `@0gfoundation/0g-ts-sdk@1.2.6` (locally pnpm-patched for zero-copy MemData reads — the stock SDK reallocates the input buffer per chunk, which is wasteful even for the small encrypted-seed payloads we ship today).
3. **0G Compute (TeeML)** — handles two distinct workloads inside the same TEE provider:
   - **Inference** during battles — per-round fighter responses + pool-blinded judge call
   - **Verdict signing** — routing-proof attestation `<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>` signed by the provider's enclave key
4. **0G Chain** — settles every economy event: pari-mutuel verdict, ELO + match history, marketplace, rentals, **and the on-chain training timeline** via `FighterTrainer.FighterTrained` events. Verifies the TEE provider's routing-proof on-chain: ECDSA recovery → `oracleKey == teeSignerAddress`; `sha256(responseBody)` matches the attestation's response-hash field; reconstructed canonical `YAP_VERDICT|<chainid>|<escrow>|<battleId>|<winner>|<verdictHash>` text appears verbatim in the response body.

## SDK Bugs Surfaced + 0G's Response

During the integration we surfaced 8 SDK + provider bugs in `@0gfoundation/0g-compute-ts-sdk` and the 0G fine-tune deployment template. Bugs #1, #4, #5 shipped in 0.8.1 within 72 hours of the report (the release notes cite the report by name in `binary-path.js`). Bugs #3, #4 (broker-side: adapter-key idempotent + actionable addDeliverable hint) landed in the broker repo as PR #479 on 2026-05-07 — that PR's summary cites our hackathon bug report by name and uses our test wallet + provider in its reproducer. Bugs #2 (Linux-only binary), #6 (`settled+unacked` deliverable deadlock), #7 (TEE download proxy timeout), and #8 (FT provider `models: []` regression on both Galileo and Aristotle) are confirmed and on the 0G roadmap — see `docs/ARCHITECTURE.md` for the full bug catalog and our local mitigations.

## Demo

- Demo URL: <https://yap-arena.xyz/> (Aristotle mainnet, chainId `16661`)
- Video: *pending*
- X post: *pending*
- Sample fighter: *TBD after retroactive scoring of mainnet fighters #3 + #4*

## Source code reproduction

The live demo + on-chain verification commands above cover the product surface judges need. Cloning is **only** required if you want to read the Solidity sources, re-run the unit suite, or hack on the FE locally.

```bash
# Prereqs: Node 20+, pnpm 9+, Foundry, Linux x86_64 with glibc ≥ 2.34
# (the 0G compute SDK ships a Linux x86_64 binary — macOS dev needs
#  Docker or remote deploy for the full pipeline)

git clone https://github.com/tamaa13/yap.git
cd yap
pnpm install

# Contracts — build + test (289 unit tests, slither 0 high)
pnpm contracts:build
pnpm contracts:test

# Frontend dev (against your own .env.local config)
cp apps/web/.env.example apps/web/.env.local
# Fill ZG_BROKER_KEY (Compute ledger + Storage uploads),
# ZG_INFERENCE_PROVIDER (provider whose teeSignerAddress = oracleKey),
# and the NEXT_PUBLIC_*_ADDR_MAINNET cascade from this README.
pnpm dev
```

The source review path is **separate from product evaluation** — there's no testnet faucet flow to mirror; live testing on Aristotle requires DEX-acquired OG (see "Live testing" above).

## License

MIT
