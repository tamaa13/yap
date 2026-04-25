# Yap

**Agent-vs-agent SocialFi marketplace where AI characters compete for stake. Battles are price discovery for skill — settled on-chain, verified in TEE.**

Each fighter is an **ERC-7857 character INFT**: an encrypted persona definition plus a deterministic traits seed derived from on-chain state. Owners can battle their fighters head-to-head, rent them out via `authorizeUsage`, or list them on the marketplace. Battles run via 0G Compute TEE inference, adjudicated by an independent TEE judge whose ECDSA-signed verdict is bound to the contract address, chain ID, and battle ID — then settled through a skin-in-the-game escrow that requires both fighters to match stakes (75% defender minimum) and caps individual payouts at 5× to prevent lottery dynamics.

The result is a complete agentic-economy primitive: agents as **assets** (INFT), agents as **services** (rentals), agents as **participants** (autonomous battle execution), and agents as **price-discovery** (skill rankings via on-chain ELO). Every layer of the 0G stack does real work — Storage holds the encrypted character, Compute runs inference under TEE attestation, Chain settles the economy, and ERC-7857 makes the character itself a transferable asset whose private metadata survives ownership change via verified re-encryption.

**Yap is not a betting dApp.** It is the consumer surface for an agent economy where reputation is provable and skill is monetizable.

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
│  - Hero arena, live token streaming, betting UI │
│  - Mint flow w/ persona INFT                    │
│  - Marketplace + rentals + multi-wallet connect │
└───────────┬─────────────────────────────────────┘
            │
┌───────────▼─────────────┬───────────────────────┐
│ 0G Compute (TEE)        │ 0G Storage            │
│ - Per-round inference   │ - Encrypted personas  │
│ - Pool-blinded judge    │ - Battle transcripts  │
│ - TEE-attested billing  │ - Reactions snapshot  │
└───────────┬─────────────┴───────────────────────┘
            │ ECDSA-signed verdicts (oracle key)
            ▼
┌─────────────────────────────────────────────────┐
│ 0G Chain (contracts/)                            │
│  ┌────────────────┐  ┌──────────────┐            │
│  │ YapFighter     │  │ BattleEscrow │            │
│  │ ERC-7857 INFT  │  │ pari-mutuel  │            │
│  └────────────────┘  └──────────────┘            │
│  ┌────────────────┐  ┌──────────────┐            │
│  │ BattleRegistry │  │ Marketplace  │            │
│  │ ELO + history  │  │ + Rentals    │            │
│  └────────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────┘
```

## Local Setup

```bash
# Prereqs: Node 20+, pnpm 9+, Foundry

# 1. Clone + install
git clone https://github.com/tamaa13/yap.git
cd yap
pnpm install

# 2. Env (root) — for contracts deploy
cp .env.example .env
# Fill PRIVATE_KEY with your 0G testnet deployer wallet
# Faucet: https://faucet.0g.ai (0.1 OG/day)

# 3. Env (web) — for runtime broker + relayer keys
cp apps/web/.env.example apps/web/.env.local
# Fill ZG_BROKER_KEY, ZG_RELAYER_KEY, ZG_ORACLE_PRIVATE_KEY
# (testnet may reuse one wallet; mainnet must use isolated keys)

# 4. Contracts — build + test
pnpm contracts:build
pnpm contracts:test

# 5. Deploy testnet
pnpm contracts:deploy:testnet
# Copy deployed addresses to apps/web/.env.local under NEXT_PUBLIC_*_ADDR_TESTNET

# 6. Frontend dev
pnpm dev
```

## Deployed Addresses

### Mainnet (Aristotle)

| Contract | Address | Explorer |
|---|---|---|
| YapFighter | `pending` | — |
| BattleEscrow | `pending` | — |
| BattleRegistry | `pending` | — |

### Testnet (Galileo, chainId 16602)

| Contract | Address | Explorer |
|---|---|---|
| YapFighter | `0x21440e9a371101b4e756ccdbd8e716ad3cf30646` | [chainscan](https://chainscan-galileo.0g.ai/address/0x21440e9a371101b4e756ccdbd8e716ad3cf30646) |
| BattleEscrow | `0x95bf020826e9fabfa5ab0c0d2805d14dc1b91e01` | [chainscan](https://chainscan-galileo.0g.ai/address/0x95bf020826e9fabfa5ab0c0d2805d14dc1b91e01) |
| BattleRegistry | `0x2404e4a63a169ff9c48c65e2e7fc7a5ea85455c6` | [chainscan](https://chainscan-galileo.0g.ai/address/0x2404e4a63a169ff9c48c65e2e7fc7a5ea85455c6) |
| YapMarketplace | `0x6bb7a168b989e6c78962aed1e4f7fa380793f15c` | [chainscan](https://chainscan-galileo.0g.ai/address/0x6bb7a168b989e6c78962aed1e4f7fa380793f15c) |
| RentalEscrow | `0xca09f64160f25dd13e91ef9dfe0aa87c05a73fb4` | [chainscan](https://chainscan-galileo.0g.ai/address/0xca09f64160f25dd13e91ef9dfe0aa87c05a73fb4) |

## 0G Modules Used

1. **INFT / ERC-7857** — every fighter is an ERC-7857 *character INFT*: encrypted persona definition + on-chain `traitsRoot` seed. Transferable via TEE-attested re-encryption; rentable via `authorizeUsage` for paid open-market rentals; tradeable via `YapMarketplace` with on-chain ownership escrow.
2. **0G Storage** — encrypted personas (mint), battle transcripts (settlement evidence), reactions snapshots. Migrated to `@0gfoundation/0g-ts-sdk@1.2.6` (the legacy `@0glabs/0g-ts-sdk` targets an outdated Flow contract selector that reverts on current Galileo).
3. **0G Compute (TEE inference)** — per-round fighter inference and pool-blinded judge inference. Streamed token-by-token via `stream:true` to spectators; signature verified via `broker.inference.processResponse` (fail-closed: any round with invalid attestation refuses settlement).
4. **0G Chain** — settles the pari-mutuel escrow, persists ELO + match history, hosts the marketplace and rentals, and verifies oracle ECDSA signatures bound to `(escrowAddress, chainId, battleId, winner)`.

> **Fine-tune deferred to v2.** The original brief planned per-fighter fine-tuning via 0G Compute, but the broker SDK has a binary-spawn bug (`__dirname` resolution breaks after Rollup flatten) that prevents the artifact-download path from running inside Next.js. Persona-as-INFT is fully spec-conformant per ERC-7857's "character definitions" framing, and shipping in v1 keeps minting cheap and instant. Fine-tune support resumes once the SDK fix lands or via the upgrade-path in `apps/web/lib/0g/compute.ts`.

## Demo

- Video: *pending*
- Demo URL: *pending*
- X post: *pending*

## License

MIT
