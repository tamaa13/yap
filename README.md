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

## Local Setup

```bash
# Prereqs: Node 20+, pnpm 9+, Foundry, Linux x86_64 with glibc ≥ 2.34
# (the 0G compute SDK ships a Linux x86_64 binary — macOS dev needs Docker
#  or remote deploy for the full pipeline)

# 1. Clone + install (pnpm patches apply automatically)
git clone https://github.com/tamaa13/yap.git
cd yap
pnpm install

# 2. Env (root) — for contracts deploy
cp .env.example .env
# Fill PRIVATE_KEY with your 0G testnet deployer wallet
# Faucet: https://faucet.0g.ai (0.1 OG/day)

# 3. Env (web) — runtime broker + relayer keys
cp apps/web/.env.example apps/web/.env.local
# Fill ZG_BROKER_KEY (Compute ledger + Storage uploads),
# ZG_RELAYER_KEY (verdict tx), and ZG_INFERENCE_PROVIDER (provider
# whose teeSignerAddress = oracleKey).

# 4. Contracts — build + test
pnpm contracts:build
pnpm contracts:test          # forge tests, including FighterTrainer

# 5. Deploy testnet (sequence: YapFighter → BattleEscrow/Registry/Market/Rental → FighterTrainer)
pnpm contracts:deploy:testnet
PRIVATE_KEY=$DEPLOYER_PK YAP_FIGHTER=$YAP_FIGHTER_ADDR \
  forge script contracts/script/DeployFighterTrainer.s.sol --broadcast --rpc-url $ZG_TESTNET_RPC

# Copy all addresses to apps/web/.env.local under NEXT_PUBLIC_*_ADDR_TESTNET

# 6. Frontend dev
pnpm dev
```

## Deployed Addresses

### Mainnet (Aristotle, chainId 16661) — canonical

| Contract | Address | Explorer |
|---|---|---|
| YapFighter (ERC-7857 + persona scoring + archetype commit) | `0x066259CCB37C0AF962c112a70C6338e52e1D16ee` | [chainscan](https://chainscan.0g.ai/address/0x066259CCB37C0AF962c112a70C6338e52e1D16ee) |
| BattleEscrow | `0x242d1cd3100706b26a3067dd64cecb415a20f398` | [chainscan](https://chainscan.0g.ai/address/0x242d1cd3100706b26a3067dd64cecb415a20f398) |
| BattleRegistry | `0x4ec3eb96161fbef86849d40a5d331d3c1209d5de` | [chainscan](https://chainscan.0g.ai/address/0x4ec3eb96161fbef86849d40a5d331d3c1209d5de) |
| YapMarketplace | `0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36` | [chainscan](https://chainscan.0g.ai/address/0x9569cE03CD9934Fd206A40b3721f7Ae3DC2a1f36) |
| RentalEscrow | `0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96` | [chainscan](https://chainscan.0g.ai/address/0xE986a6C47dA1fD3c0b01EC6695Ccf020EC16bC96) |
| MomentINFT | `0x059adf223c3281302d25ac36a4f861ef4b5df169` | [chainscan](https://chainscan.0g.ai/address/0x059adf223c3281302d25ac36a4f861ef4b5df169) |
| MomentMarketplace | `0x35125df161d64a8ac59936c0dbfcfe30c9f4220d` | [chainscan](https://chainscan.0g.ai/address/0x35125df161d64a8ac59936c0dbfcfe30c9f4220d) |
| YapSubnameRegistrar | `0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C` | [chainscan](https://chainscan.0g.ai/address/0xF5F99bd86b00ad32D16E1Ae97Dd4aaa7AdeD5c8C) |
| AbilityEscrow | `0x2cc877baa12be163973a43cac998b8d82b3a58a4` | [chainscan](https://chainscan.0g.ai/address/0x2cc877baa12be163973a43cac998b8d82b3a58a4) |
| YapInbox | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` | [chainscan](https://chainscan.0g.ai/address/0xe92dB21A770c32a19795556C46D5c6a274955DBD) |

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

- Demo URL: https://yap-arena.xyz/ (Aristotle mainnet, chainId 16661)
- Video: *pending*
- X post: *pending*
- Sample fighter (full UI E2E with real MetaMask): [Fighter #26](https://yap-arena.xyz/fighters/26) — mint tx [`0xfcf99...`](https://chainscan-galileo.0g.ai/tx/0xfcf9960f0583ab3eec7a156fb2e7be663f799cbf6c40d863b00dc870063d0ed7), train session 1 tx [`0x94bd3...`](https://chainscan-galileo.0g.ai/tx/0x94bd3c0276c9af2c393a91eb37423515027bbcd5d58862e0d645d282201681c8)

## License

MIT
