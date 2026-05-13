---
description: Verifiable AI combat arena on 0G — what it is, why it matters, how it works.
---

# Yap

<figure><img src=".gitbook/assets/yap-mark.svg" alt="Yap" width="56"><figcaption></figcaption></figure>

> **Yap is a verifiable AI combat arena where every fighter is an encrypted ERC-7857 character INFT and every verdict is signed inside a 0G Compute TEE provider's enclave, then settled on 0G Chain.**

Most AI-judged dApps ask you to trust an off-stack signer service.
"Our oracle says Fighter A won — please believe us." That's a single
point of trust, a single point of failure, and a single point of
manipulation.

Yap removes the off-stack signer entirely. The TEE provider that runs
the inference is the same enclave that signs the verdict — and the
contract verifies that signature recovers to the provider's
TEE-derived address before paying out a single cent. No Yap-controlled
oracle key. No replayable signatures. If the provider is compromised,
settlement fails closed.

## What you can do with Yap

* **Mint a fighter** — drop in 10 lines of persona JSONL. The server
  encrypts it with a fresh AES-GCM key, uploads the ciphertext to 0G
  Storage, seals the key for the recipient, and you sign one
  transaction. Total wall-clock: about five seconds.
* **Battle** — pick another fighter, name a topic, watch them debate
  for three rounds of streaming TEE inference. The same provider
  judges, then echoes a canonical verdict text the contract can
  reconstruct from on-chain state.
* **Settle** — pari-mutuel pool pays winners; verdict signature is
  verified via ECDSA recovery, sha256 hash match against the
  provider's response body, and canonical reconstruction at the
  exact byte offset. Three independent checks before any money moves.
* **Trade** — fighters and Battle Moments (round highlights) live in
  the same marketplace with re-encryption on transfer. New owner
  gets a fresh sealed key; the persona stays sealed across hands.
* **Rent** — list your fighter for usage authorization with co-signed
  dispute resolution: 24-hour acceptance window, 7-day max rental,
  asymmetric platform-fee rebate when the dispute split favors the
  renter. No Yap acting as referee.

## Why "verifiable" matters

The honest answer: most AI dApps aren't verifiable. They claim TEE
attestation but ship signature paths that recover to a key the
project controls, not the enclave. Yap's design makes that
substitution physically impossible:

| Threat | Yap's defense |
|---|---|
| Yap operator forges a verdict | No Yap signing key exists. ECDSA recovery on the verdict signature must land on the registered `oracleKey` (= provider's TEE-derived address). |
| TEE provider returns wrong text | Contract reconstructs the canonical `YAP_VERDICT|chainId|escrow|battleId|winner|verdictHash` line from on-chain state and verifies it matches the bytes at the response body's content offset. |
| TEE provider replays an old signature | Routing-proof attestation binds the signature to `<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>`. A replay against a different battleId fails sha256 match. |
| Some other TEE provider impersonates ours | Provider identity is part of the routing-proof. Recovery + identity match are checked together. |

In practice this means: if the cryptographic chain breaks anywhere,
settlement reverts. The contract won't pay a cent against a busted
proof.

## How a battle plays out

Picture two minted fighters, Stiletto and Kompor:

1. **Stiletto's owner stakes** 0.05 OG and challenges Kompor on the
   topic "Pineapple on pizza is structural betrayal." Battle is
   `Pending` on `BattleEscrow`.
2. **Kompor's owner accepts** with at least 75% of the challenger's
   stake (anti-chip-shot rule). Battle moves to `Active`. Spectators
   can place pari-mutuel bets on either side.
3. **Anyone calls** `POST /api/battle/<id>/start`. The server runner
   spawns the round loop:
   * Round 1: Stiletto's persona prompt + topic stream from a 0G
     Compute TEE provider. Tokens stream live to spectators via SSE.
     Round-end damage is scored by a separate quick inference call —
     Kompor takes Wit-modulated HP damage if she lost the round.
   * Round 2: Same flow, Stiletto sees Kompor's round-1 argument as
     context. Damage applied per HP morale.
   * Round 3: Final round, full transcript context.
   * If either fighter's HP hits 0 mid-battle, the runner short-
     circuits to a TKO.
4. **Judging** — the same TEE provider that ran inference judges
   the full transcript with reputation stats and audience reactions
   as soft priors. Symmetric-bias guardrail (label swap by battle ID
   parity) prevents positional bias.
5. **Canonical signing** — a second inference call asks the LLM to
   echo `YAP_VERDICT|<chainId>|<escrow>|<battleId>|<winner>|<verdictHash>`
   verbatim. The provider's enclave personal-signs the response.
6. **On-chain submission** — relayer key calls
   `BattleEscrow.submitVerdict(battleId, winner, verdictHash, responseBody, contentOffset, signedText, teeSignature)`.
   Contract verifies ECDSA recovery, sha256 match, and canonical
   reconstruction. State moves to `Verdict`.
7. **Settlement** — after the dispute window, anyone calls `settle`.
   Winners share the losing-side pool minus a treasury fee, capped
   at 5x stake to prevent gambling unwinds. `BattleRegistry` updates
   ELO for both fighters.
8. **Mint a moment** — if a round was particularly sharp, anyone can
   mint that round as a Battle Moment ERC-7857 sibling INFT. The
   transcript clip + TEE attestation chain travel with the token.

Total elapsed: 3-5 minutes for a 3-round battle.

## What's novel

* **Routing-proof TEE attestation for AI verdicts.** Most TEE projects
  sign the output. Yap signs `<reqSha>:<respSha>:<providerType>:<identity>:<tlsCert>`,
  binding the verdict to the exact request/response pair *and* the
  provider identity. A swap-attack provider can't forge a competitor's
  verdict.
* **Encrypted IP transfer primitive.** ERC-7857's sealed-key handoff
  replaces "fine-tune weights ship with the NFT." We discovered the
  fine-tune output was never re-loaded into battle inference (provider
  runs base model regardless). Cutting fine-tune turned a 7-minute
  theatrical mint into an honest 5-second mint without losing any
  guarantee — the encryption + sealed-key economy is the actual
  novelty.
* **Co-signed dispute resolution in rentals.** RentalEscrow's 24h
  acceptance window with a co-signed split gives renters recourse
  without making Yap a referee. Platform fee scales inverse to
  renter-favor: a 100% renter refund pays *zero* protocol fee. No
  incentive to cheat the user.
* **Stats that actually drive inference.** A fighter's Logic stat sets
  their per-round inference temperature and max tokens (high-Logic
  fighters argue more deliberately, take more tokens to construct
  chains). Wit > 80 injects a "lean into quick comebacks" modifier
  into the system prompt. HP morale depletes per round — the bar
  isn't cosmetic.
* **Render-driven entry ceremony.** First-access splash dismisses on
  actual data hooks ready (with safety timeout), not a static
  timer. Reduced-motion preference respected; sessionStorage-gated
  to first access only.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), TypeScript, RainbowKit + wagmi, Framer Motion |
| Smart Contracts | Solidity 0.8.24, Foundry, `--evm-version cancun` |
| Storage | 0G Storage SDK `@0gfoundation/0g-ts-sdk@1.2.6` (pnpm-patched for zero-copy MemData) |
| Compute | 0G Compute SDK `@0gfoundation/0g-compute-ts-sdk@0.8.1` (pnpm-patched for ESM Wallet identity) |
| Chain | 0G Aristotle (16661) + Galileo (16602) |
| Hosting | Self-hosted Biznet VPS (Ubuntu 22.04 + nginx + pm2) |
| CI/CD | GitHub Actions → SSH deploy + pm2 reload (build on runner, ship `.next` tarball) |

## Where to dig deeper

* [How it works](how-it-works.md) — full mint / train / battle / settle
  walkthrough at the user level
* [System architecture](ARCHITECTURE.md) — protocol-level deep dive
  with sequence diagrams and contract roles
* [Deployed contracts](contracts.md) — Galileo testnet addresses,
  TEE signer + provider, mainnet gating policy
* [Glossary](glossary.md) — INFT, TEE, ERC-7857, routing-proof
  attestation, anti-gambling caps, every term defined
* [Bug catalog](bug-catalog.md) — 8 SDK + provider bugs surfaced to
  the 0G team during this hackathon; 4 fixed in 0G PR #479

## Try it now

* **Live demo** (Galileo testnet, chainId `16602`):
  `https://yap-arena.xyz/`
* **Faucet**: <https://faucet.0g.ai>
* **Explorer**: <https://chainscan-galileo.0g.ai>
* **Source**: <https://github.com/tamaa13/yap>

Connect any EVM wallet, switch to Galileo, mint a fighter for 0.05 OG,
pick a topic, watch them yap.

## Built for

[0G APAC Hackathon 2026](https://www.hackquest.io/hackathons/0G-APAC-Hackathon).
