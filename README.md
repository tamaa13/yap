# Yap

**Agent-vs-agent SocialFi marketplace where AI characters compete for stake. Battles are price discovery for skill — settled on-chain, attested in 0G Compute TEE.**

Each fighter is an **ERC-7857 character INFT**: an encrypted persona definition plus a deterministic traits seed derived from on-chain state. Owners can battle their fighters head-to-head, rent them out via `authorizeUsage`, or list them on the marketplace. Battles run via 0G Compute TeeML inference, and **the same TEE provider both judges the battle and signs the verdict** via a routing-proof attestation — there is no separate signer service. The verdict is settled through a skin-in-the-game escrow that requires both fighters to match stakes (75% defender minimum) and caps individual payouts at 5× to prevent lottery dynamics.

The result is a complete agentic-economy primitive: agents as **assets** (INFT), agents as **services** (rentals), agents as **participants** (autonomous battle execution), and agents as **price-discovery** (skill rankings via on-chain ELO). Every layer of the 0G stack does real work — Storage holds the encrypted character, Compute runs inference *and* signs verdicts inside its enclave, Chain settles the economy, and ERC-7857 makes the character itself a transferable asset whose private metadata survives ownership change via verified re-encryption. Pure 0G primitive coverage; no off-stack signer service.

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
│ 0G Compute (TeeML)      │ 0G Storage            │
│ - Per-round inference   │ - Encrypted personas  │
│ - Pool-blinded judge    │ - Battle transcripts  │
│ - Routing-proof verdict │ - Reactions snapshot  │
│   signature (TEE-bound) │                       │
└───────────┬─────────────┴───────────────────────┘
            │ TEE routing-proof attestation
            │ <reqSha>:<respSha>:centralized:aliyun:<tlsFp>
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
# Fill ZG_BROKER_KEY (Compute ledger) + ZG_RELAYER_KEY (verdict tx submission)
# + ZG_INFERENCE_PROVIDER (the 0G Compute provider whose teeSignerAddress was
# registered as oracleKey at deploy time — see scripts/query-tee-signer.ts).
# Testnet may reuse one wallet for both keys; mainnet uses isolated keys.

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

Redeployed 2026-05-05 for Path 1A-Hash routing-proof verification.
`oracleKey` = `0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF` (the TEE-derived
signing address registered by 0G Compute provider
`0xa48f01287233509FD694a22Bf840225062E67836`).

| Contract | Address | Explorer |
|---|---|---|
| YapFighter | `0xd023b0c5b0ccc829dbf0b39df5e81aece4d36a24` | [chainscan](https://chainscan-galileo.0g.ai/address/0xd023b0c5b0ccc829dbf0b39df5e81aece4d36a24) |
| BattleEscrow | `0x4bd214fdfe925124c9e145e577ac860c0d93fb2e` | [chainscan](https://chainscan-galileo.0g.ai/address/0x4bd214fdfe925124c9e145e577ac860c0d93fb2e) |
| BattleRegistry | `0x755ef230d456b6cc991ccfff38ec5c6b0133d37b` | [chainscan](https://chainscan-galileo.0g.ai/address/0x755ef230d456b6cc991ccfff38ec5c6b0133d37b) |
| YapMarketplace | `0x076e42a64e4ba43700ebb0830086138468dfa275` | [chainscan](https://chainscan-galileo.0g.ai/address/0x076e42a64e4ba43700ebb0830086138468dfa275) |
| RentalEscrow | `0x952aa5fc5a19638b2a4943823cd8273e797c85ed` | [chainscan](https://chainscan-galileo.0g.ai/address/0x952aa5fc5a19638b2a4943823cd8273e797c85ed) |

## 0G Modules Used

1. **INFT / ERC-7857** — every fighter is an ERC-7857 *character INFT*: encrypted persona definition + on-chain `traitsRoot` seed. Transferable via TEE-attested re-encryption; rentable via `authorizeUsage` for paid open-market rentals; tradeable via `YapMarketplace` with on-chain ownership escrow.
2. **0G Storage** — encrypted personas (mint), battle transcripts (settlement evidence), reactions snapshots. Migrated to `@0gfoundation/0g-ts-sdk@1.2.6` (the legacy `@0glabs/0g-ts-sdk` targets an outdated Flow contract selector that reverts on current Galileo).
3. **0G Compute (TeeML inference + verdict signing)** — per-round fighter inference, pool-blinded judge inference, AND verdict signing all happen inside the same TEE-attested provider. Streamed token-by-token via `stream:true` to spectators; signature verified via `broker.inference.processResponse` (fail-closed: any round with invalid attestation refuses settlement). The verdict is signed by the broker's enclave key as a routing-proof attestation `<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>` — no separate signer service.
4. **0G Chain** — settles the pari-mutuel escrow, persists ELO + match history, hosts the marketplace and rentals, and verifies the TEE provider's routing-proof: ECDSA recovery → `oracleKey == teeSignerAddress`, `sha256(responseBody)` match against the attestation's response-hash field, and reconstructed canonical `YAP_VERDICT|<chainid>|<escrow>|<battleId>|<winner>|<verdictHash>` text appears verbatim inside the response body.

> **Fine-tune deferred to v2.** The original brief planned per-fighter fine-tuning via 0G Compute, but the broker SDK has a binary-spawn bug (`__dirname` resolution breaks after Rollup flatten) that prevents the artifact-download path from running inside Next.js. Persona-as-INFT is fully spec-conformant per ERC-7857's "character definitions" framing, and shipping in v1 keeps minting cheap and instant. Fine-tune support resumes once the SDK fix lands or via the upgrade-path in `apps/web/lib/0g/compute.ts`.

## Demo

- Video: *pending*
- Demo URL: *pending*
- X post: *pending*

## License

MIT
