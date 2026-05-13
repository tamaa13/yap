# Yap — HackQuest submission (TEE-attested persona pivot)

**Status**: DRAFT for Tama review. Replaces / extends the existing `SUBMISSION.md`. Paste-ready copy below. Approve / edit / paste into HackQuest after persona-attestation cascade ships.

---

## Tagline (≤120 chars)

Verifiable AI combat arena on 0G. Personas TEE-scored at mint, verdicts TEE-signed at settle. No off-stack signer.

## One-liner (~15 words)

AI debate arena where every fighter's persona is graded inside a TEE — stats earned, not rolled.

## Short description (~80 words)

Yap is a verifiable AI combat arena on 0G. Each fighter is an ERC-7857 INFT whose persona is read by a 0G Compute TEE judge at mint, scored across five dimensions, and committed on-chain through the same routing-proof attestation that settles battle verdicts. Archetypes unlock unique mechanical abilities gated by those scores. Per-round owner stance picks turn spectatorship into play. Stats are earned from writing, not seeded from RNG.

## Long description (~400 words)

**The problem.** Every AI-combat dApp ships the same shape: a JPEG with stats above it, and somewhere off-stack a private signer that says who won. Stats are seeded from a hash. Verdicts are vouched by a project key. Players are told to trust the brand. That's the AI Arena niche cap — you watch your NFT, you don't play it, and the numbers above its head mean nothing.

**Yap's bet.** A fighter's stats should reflect the substance of what its owner wrote, not a die roll. A verdict should be signed by the same silicon that ran the inference, not a project-controlled key. And players should make decisions inside the round, not just at mint time.

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

**Per-round stance picks.** Each round opens a 5-second window where the owning wallet picks ATTACK or BUILD for that round's argument. The stance threads into the persona prompt for that round's inference. The fighter is the asset; you're the cornerman.

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
    └─> per-round stance pick (ATTACK/BUILD) signed by owner wallet
    └─> 0G Compute TEE inference each round, same provider chain
    └─> verdict: YAP_VERDICT|chainId|escrow|battleId|winner|verdictHash
    └─> BattleEscrow.submitVerdict — same three checks as mint score
    └─> settle: pool pays winners; 5% royalty routes to winning fighter's owner
```

Same trust primitive at both ends. Same provider's TEE signer registered in the 0G ServingContract. No Yap-controlled signing key exists.

## Demo flow (judges, 90 seconds)

1. **Mint** — paste 10 lines of persona JSONL, see the five scores resolve from the TEE judge with the canonical line exposed. Note: "Aggression 4 — Mic Drop unlocked" preview before you pick archetype + sign.
2. **Battle setup** — challenge another fighter; both sides stake; pool opens. Watch the archetype-ability indicator on the live arena card.
3. **Per-round play** — 5-second stance picker opens at round start; pick ATTACK or BUILD; stance threads into that round's TEE inference.
4. **Verdict** — same routing-proof signature primitive runs again, now over the battle transcript. Three on-chain checks gate settlement.
5. **Settle** — winners share the losing pool (5x cap), 5% routes to the winning fighter's owner as a royalty. ELO updates in BattleRegistry.

## Deployments — Galileo testnet (chainId 16602)

| Contract | Address |
|---|---|
| YapFighter (ERC-7857) | `0xc2A82B1c6cb820ccf0C7732F40733A4101615CA2` |
| BattleEscrow | `0xC3a196f1e25485E1059199c2F4D2afdd07043Cb8` |
| BattleRegistry | `0x8A665bd7dFed87A1d6B87f1e5ecbc70E08fb7bD3` |
| YapMarketplace | `0xf4e65e53b203E4EF64Fedfe0C77BD83C56f7CEf1` |
| RentalEscrow | `0xad7b130d1ED52e33F1c64C7349E4994423e19E5b` |
| MomentINFT | `0xde6f1Ad216B2de19DBE5418c278DDbec1633092f` |

**Note**: addresses above are v3 cascade pre-persona-attestation. New cascade (v4) ships when yap-contracts finishes recordMintScores + AbilityEscrow phases — table updates then.

**TEE signer** (Galileo): `0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF` for provider `0xa48f01287233509FD694a22Bf840225062E67836`. Same signer verifies both mint-time persona scores and settle-time verdicts.

**Mainnet (Aristotle, 16661)** held until 0G Bug #6 (broker TLS cert validation) clears upstream.

## Demo

- **Live**: http://103.150.227.197/
- **Video**: [paste HackQuest URL after upload]
- **GitHub**: https://github.com/tamaa13/yap
