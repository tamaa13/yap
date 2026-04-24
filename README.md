# Yap

**Verifiable AI combat arena, settled on-chain.**

Mint AI fighters as INFTs (ERC-7857). Pit them in text-based debate battles. A TEE Judge adjudicates with cryptographic proof. Spectators stake 0G on outcomes.

Built on [0G](https://0g.ai) for the [0G APAC Hackathon 2026](https://www.hackquest.io/hackathons/0G-APAC-Hackathon).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, Geist fonts |
| Smart Contracts | Solidity 0.8.19, Foundry, `--evm-version cancun` |
| Storage | 0G Storage (Log + KV layer) via `@0glabs/0g-ts-sdk` |
| Compute | 0G Compute (TEE) via `@0glabs/0g-serving-broker` |
| Chain | 0G Aristotle mainnet (16661) + Galileo testnet (16602) |
| Hosting | Vercel |

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Next.js Frontend (apps/web)                     │
│  - Hero arena, spectator view, betting UI       │
│  - Mint flow w/ fine-tune                       │
│  - Multi-wallet connect                         │
└───────────┬─────────────────────────────────────┘
            │
┌───────────▼─────────────┬───────────────────────┐
│ 0G Compute (TEE)        │ 0G Storage (Log + KV) │
│ - Fine-tune persona     │ - Encrypted weights   │
│ - Inference per turn    │ - Match history       │
│ - TEE Judge verdict     │ - Reactions log       │
└───────────┬─────────────┴───────────────────────┘
            │ signed attestations
            ▼
┌─────────────────────────────────────────────────┐
│ 0G Chain (contracts/)                            │
│  ┌────────────────┐  ┌──────────────┐            │
│  │ YapFighter     │  │ BattleEscrow │            │
│  │ ERC-7857 INFT  │  │ betting pool │            │
│  └────────────────┘  └──────────────┘            │
│  ┌────────────────┐                              │
│  │ BattleRegistry │                              │
│  │ ELO + history  │                              │
│  └────────────────┘                              │
└─────────────────────────────────────────────────┘
```

## Local Setup

```bash
# Prereqs: Node 20+, pnpm 9+, Foundry

# 1. Clone + install
git clone https://github.com/<user>/yap.git
cd yap
pnpm install

# 2. Env
cp .env.example .env.local
# Fill PRIVATE_KEY with your 0G testnet wallet
# Faucet: https://faucet.0g.ai (0.1 OG/day)

# 3. Contracts — build + test
pnpm contracts:build
pnpm contracts:test

# 4. Deploy testnet
pnpm contracts:deploy:testnet

# Copy deployed addresses to .env.local under NEXT_PUBLIC_*_ADDR_TESTNET

# 5. Frontend dev
pnpm dev
```

## Deployed Addresses

### Mainnet (Aristotle)

| Contract | Address | Explorer |
|---|---|---|
| YapFighter | `pending` | — |
| BattleEscrow | `pending` | — |
| BattleRegistry | `pending` | — |

### Testnet (Galileo)

| Contract | Address | Explorer |
|---|---|---|
| YapFighter | `pending` | — |
| BattleEscrow | `pending` | — |
| BattleRegistry | `pending` | — |

## 0G Modules Used

1. **INFT / ERC-7857** — every fighter is an ERC-7857 token with encrypted weights, transferable via TEE-attested re-encryption, rentable via `authorizeUsage`.
2. **0G Storage (Log layer)** — encrypted model weights, match transcripts.
3. **0G Storage (KV layer)** — mutable fighter stats, reactions stream.
4. **0G Compute (TEE)** — fine-tune persona, per-turn inference, TEE Judge with attestation.
5. **0G Chain** — settlement (betting escrow, payout), state (fighter registry, ELO).
6. **DASigners precompile** — verify battle quorum signers for data availability proofs (optional).

## Demo

- Video: *pending*
- Demo URL: *pending*
- X post: *pending*

## License

MIT
