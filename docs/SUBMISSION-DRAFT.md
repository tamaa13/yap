# Yap — HackQuest submission (TEE-attested persona pivot)

**Track**: Agentic Economy & Autonomous Applications (Track 3)

---

## HackQuest Form Inputs (copy-paste ready)

**Project name**: Yap

**One-sentence description** (19 words, under 30-word limit):
Verifiable AI combat arena on 0G. Personas TEE-scored at mint, verdicts TEE-signed at settle. No off-stack signer.

**Short summary**: see "Short description" below (~80 words, ready to paste).

**Track**: Agentic Economy & Autonomous Applications (Track 3)

**GitHub**: <https://github.com/tamaa13/yap>

**Primary 0G mainnet contract** (with Explorer):
YapFighter v4 — `0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b`
<https://chainscan.0g.ai/address/0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b>

**Demo video**: *pending recording, ≤3 min*

**X post**: *pending*

**Live demo**: <https://yap-arena.xyz/>

---

## Tagline (≤120 chars)

Verifiable AI combat arena on 0G. Personas TEE-scored at mint, verdicts TEE-signed at settle. No off-stack signer.

## One-liner (~15 words)

AI debate arena where every fighter's persona is graded inside a TEE — stats earned, not rolled.

## Short description (~80 words)

Yap is a verifiable AI combat arena on 0G. Each fighter is an ERC-7857 INFT whose persona is read by a 0G Compute TEE judge at mint, scored across five dimensions, and committed on-chain through the same routing-proof attestation that settles battle verdicts. Archetypes unlock unique mechanical abilities gated by those scores. Once minted, battles run autonomously — the AI fighter argues end-to-end without owner intervention. Stats are earned from writing, not seeded from RNG.

## Long description (~400 words)

**The problem.** Every AI-combat dApp ships the same shape: a JPEG with stats above it, and somewhere off-stack a private signer that says who won. Stats are seeded from a hash. Verdicts are vouched by a project key. Players are told to trust the brand. That's the AI Arena niche cap — you watch your NFT, you don't play it, and the numbers above its head mean nothing.

**Yap's bet.** A fighter's stats should reflect the substance of what its owner wrote, not a die roll. A verdict should be signed by the same silicon that ran the inference, not a project-controlled key. And a fighter, once minted, should fight on its own — the persona you sealed at mint is the persona that argues each round.

**Architecture.** Three layers, each a real 0G primitive doing load-bearing work.

- **YapFighter (ERC-7857)** — encrypted persona pinned on 0G Storage, sealed key + metadataHash + on-chain provenance committed at mint. Re-encryption on every transfer.
- **0G Compute TEE attestation** — the same `<reqSha>:<respSha>:<providerType>:<providerIdentity>:<tlsCert>` routing-proof primitive is used twice: once at mint (persona scores) and once at settle (battle verdict). One trust assumption, two callsites.
- **BattleEscrow** — pari-mutuel pool with anti-gambling caps (75% defender match minimum, 5x payout cap per winner) and a 5% royalty routed to the winning fighter's owner on every settled pool.

**Persona attestation — the headline.** At mint, the 0G Compute TEE judge reads the seed text and scores five dimensions on a 1–5 scale:

| Dimension | Method | Source |
|---|---|---|
| **Logos** | LLM judge (median-of-5) | Argument cogency, premise→conclusion |
| **Rhetoric** | LLM judge (median-of-5) | Figurative effectiveness, audience pull |
| **Aggression** | LLM judge (median-of-5) | Stance strength, low hedging ratio |
| **Range** | MTLD stylometric | Lexical diversity, deterministic |
| **Concreteness** | Brysbaert mean | Concrete/abstract ratio, deterministic |

The five scores pack into a canonical line:
`YAP_FIGHTER_SCORE|chainId|fighterAddr|tokenId|seedHash|logos|rhetoric|aggression|range|concreteness`.

The TEE provider echoes that line character-for-character and signs the response body. `YapFighter.mint` verifies the same three checks `BattleEscrow.submitVerdict` runs at settle time: ECDSA recovery to the registered oracleKey, sha256 match on the response body, canonical reconstruction at the byte offset. Replay across chains, contracts, and tokens is blocked by the canonical's identifiers baking into the bytes the TEE attests over.

**Archetypes with mechanics, not flavor.** The six archetypes (Roaster / Debater / Philosopher / Troll / Scholar / Provocateur) each unlock one unique ability, gated by a trait threshold computed from those attested scores:

| Archetype | Ability | Gate |
|---|---|---|
| Roaster | **Mic Drop** — round-winning damage 2x | Aggression ≥ 3 |
| Debater | **Counterpoint** — see opponent arg before reply | Logos ≥ 3 |
| Philosopher | **Reframe** — pivot topic angle 1×/battle | Logos ≥ 4 |
| Troll | **Derail** — cap opponent next round 50 tokens | Aggression ≥ 4 |
| Scholar | **Cite Precedent** — append past battle excerpt | Range ≥ 3 |
| Provocateur | **Bait** — inject prompt mod to opponent | Rhetoric ≥ 3 |

Archetype + threshold both commit on-chain at mint. The mint UI surfaces which abilities your seed unlocks before you sign — so the picker isn't guesswork.

**Autonomous battle execution.** Once the match opens, the fighter argues on its own. Each round's stance (offense vs. consolidation) is derived from battle state — HP, prior-round outcome, archetype tendency — and threaded into the persona prompt that runs through the TEE. There's no owner-in-the-loop gate. The fighter you sealed at mint is the fighter that shows up to round 5.

**Why this is hard to copy.** Every layer that makes the above work sits on top of 0G's TEE infrastructure — the broker's routing-proof format, the provider's TEE-derived signing address registered in the ServingContract, the canonical-echo + signature verification primitive. Without that stack, you ship the same off-stack-signer JPEG as everyone else.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), TypeScript, RainbowKit + wagmi, Framer Motion |
| Smart Contracts | Solidity 0.8.24, Foundry, `--evm-version cancun` |
| Storage | 0G Storage SDK `@0gfoundation/0g-ts-sdk@1.2.6` |
| Compute | 0G Compute SDK `@0gfoundation/0g-compute-ts-sdk@0.8.1` |
| Chain | 0G Aristotle (16661) + Galileo (16602) |
| Stylometry | MTLD (Range), Brysbaert concreteness norms |
| Hosting | Self-hosted Biznet VPS (Ubuntu 22.04 + nginx + pm2) |

## What's verifiable on-chain (chain of trust)

```
seed text bytes
    └─> sha256 → seedHash committed on-chain at mint
    └─> 0G Compute TEE judge (median-of-5 per LLM dimension)
    └─> 5 scores packed into canonical: YAP_FIGHTER_SCORE|...
    └─> TEE provider echoes canonical, signs response body
    └─> YapFighter.mint verifies: ECDSA → oracleKey, sha256(respBody), canonical@offset
    └─> archetype + scores committed → archetype ability gate locked

battle starts
    └─> per-round stance (ATTACK/BUILD) server-computed from state
    └─> 0G Compute TEE inference each round, same provider chain
    └─> verdict: YAP_VERDICT|chainId|escrow|battleId|winner|verdictHash
    └─> BattleEscrow.submitVerdict — same three checks as mint score
    └─> settle: pool pays winners; 5% royalty routes to winning fighter's owner
```

Same trust primitive at both ends. Same provider's TEE signer registered in the 0G ServingContract. No Yap-controlled signing key exists.

## Demo flow (judges, 90 seconds)

1. **Mint** — paste 10 lines of persona JSONL, see the five scores resolve from the TEE judge with the canonical line exposed. Note: "Aggression 4 — Mic Drop unlocked" preview before you pick archetype + sign.
2. **Battle setup** — challenge another fighter; both sides stake; pool opens. Watch the archetype-ability indicator on the live arena card.
3. **Autonomous rounds** — fighters argue on their own. Each round's stance (ATTACK vs BUILD) is derived from current battle state and threaded into the TEE-attested inference. No owner gating, no per-round popup.
4. **Verdict** — same routing-proof signature primitive runs again, now over the battle transcript. Three on-chain checks gate settlement.
5. **Settle** — winners share the losing pool (5x cap), 5% routes to the winning fighter's owner as a royalty. ELO updates in BattleRegistry.

## Deployments — Aristotle mainnet (chainId 16661)

| Contract | Address |
|---|---|
| YapFighter (ERC-7857 + 0.1 OG mint fee) | `0x3a3b176E91AE3Da4eF3a6B968E84120fC61CFd2b` |
| BattleEscrow | `0x311ecf5B66Ab569Bcb4cB96e7b4085CA2b59b037` |
| BattleRegistry | `0xda4f5279e677576831Fb5d99f2C754D5407030ee` |
| YapMarketplace | `0xb20769dD18F1438CA0aDa66Adf9ba670Cab6b9B0` |
| RentalEscrow | `0x6b89A8E306E3E567598A6233F10D6c410da07eB8` |
| YapSubnameRegistrar | `0x4aC6E562b1b3CF9B2c0B6A3789200E889eD7576d` |
| MomentINFT | `0x42C85f0EAa8Aef98c0ec1057e6c241769861A1aF` |
| MomentMarketplace | `0x0514c5F6a9b7a57d329f41125C9E84C805F3Be7c` |
| AbilityEscrow | `0x07E47975Aac222B0D82DB8b5f5A6a24Fd87C7148` |
| YapInbox | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

(v4 cascade, 2026-05-13. Previous v3 addresses preserved in `docs/contracts.md`.)

**TEE signer** (Aristotle): `0xd45b4301940B297F76d6e622c1CeA2AE660617d4` for provider `0x992e6396157Dc4f22E74F2231235D7DE62696db5` running `qwen3.6-plus` (1M context, roleplay-tuned, separated-centralized TeeTLS routing-proof architecture). Same signer verifies both mint-time persona scores AND settle-time verdicts — single TEE attestation primitive used at two callsites.

**Score oracle key** on YapFighter: same as verdict oracle, decoupled via separate setter (`setScoreOracleKey`) for independent rotation if needed.

**Runner role** (server-side `logAccess` calls per inference round): `0xe5e0bf763be8CF6a7BBA1B18Fa5Ca110b0587fdC` granted RUNNER_ROLE on YapFighter at deploy.

**Galileo testnet (chainId 16602)** preserved as historical reference — see `docs/contracts.md` for the full testnet address table.

## Demo

- **Live**: https://yap-arena.xyz/
- **Video**: [paste HackQuest URL after upload]
- **GitHub**: https://github.com/tamaa13/yap
