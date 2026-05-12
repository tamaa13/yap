# Yap — HackQuest submission

Drop-in copy for the HackQuest project page. Tama copies sections into the
form fields. Voice follows `apps/web/STYLE.md`: specific, brief, a touch cocky.

---

## Tagline (≤120 chars)

Verifiable AI combat arena on 0G. Fighters are ERC-7857 INFTs. Verdicts are TEE-attested. No off-stack signer.

## Short description (≤500 chars)

Yap is a verifiable AI combat arena where every fighter is an encrypted
ERC-7857 character INFT and every verdict is signed by a 0G Compute TEE
provider, then settled on 0G Chain. Mint a fighter from a 10-line persona
seed, debate three rounds against another fighter, and the contract
verifies the routing-proof attestation before paying out the pari-mutuel
pool. No Yap-controlled oracle key. No replayable signatures. No fine-tune
theatre.

## Long description

**Yap** is a complete agentic-economy primitive on 0G. AI characters compete
in three-round debates that are judged inside a TEE, signed by the same
provider that ran the inference, and settled on-chain via a routing-proof
attestation chain. Every layer of the 0G stack does real, load-bearing
work — Storage holds the encrypted persona payload, Compute runs both the
debate inference and the verdict signing, Chain settles every economy
event, and ERC-7857 makes the character itself a transferable asset.

**The four primitives:**

- **Fighter (ERC-7857 INFT)** — encrypted persona pinned on 0G Storage,
  sealed key + metadata committed on-chain. Mint takes ~5 seconds end to
  end. Owner can re-seal with new style lines (continuous learning) — each
  re-seal emits a `FighterTrained` event so the evolution timeline is
  independently auditable.
- **Battle (TEE-attested)** — three rounds of streaming inference from
  one 0G Compute provider, then a pool-blinded judge call from the same
  provider. The judge's verdict is bound to the transcript via
  `verdictHash = keccak256(transcript || judgeChatID)`, then a *second*
  inference call asks the LLM to echo a canonical `YAP_VERDICT|...|` line.
  The broker enclave signs `<reqSha>:<respSha>:<providerType>:<providerIdentity>:<tlsCert>`
  on top. Contract verifies ECDSA recovery, sha256 match, and canonical
  reconstruction location before settling. Provider key compromise =
  detectable; Yap key compromise = doesn't exist.
- **Marketplace + rentals (co-signed disputes)** — fighters and Battle
  Moments trade in a single marketplace with re-encryption on transfer.
  Rentals use co-signed split dispute resolution: 24 h acceptance
  window, 7 d max lifetime, asymmetric platform-fee rebate when the
  split favors the renter. No Yap wasit.
- **Battle Moments (ERC-7857 sibling)** — round-by-round highlights that
  mint as their own INFT family. Encrypted transcript clip + TEE
  attestation chain travel with the token. NBA Top Shot for AI debate.

**The cred:**

- **8 SDK + provider bugs surfaced** to the 0G team during build
- **PR #479 cited our hackathon report by name** for broker-side fixes to
  Bugs #3 and #4 (verdict signature replay protection + provider TLS
  cert handling)
- **18 contract test files**, full fork tests against live Galileo deploy
- **Render-driven entry ceremony** — splash dismissal tied to actual data
  readiness, not a static timer
- **Wire-or-drop discipline** — no fake numbers, no Math.sin sparklines,
  no dead toggles. If a number doesn't come from chain or a hook, it's
  not on screen.

## Demo

- **Live demo**: http://103.150.227.197/
- **Network**: 0G Galileo testnet (chainId 16602)
- **Demo video**: [paste HackQuest video URL after upload]
- **GitHub**: https://github.com/tamaa13/yap

To try it without setup, connect any EVM wallet to Galileo and use the
faucet at https://faucet.0g.ai. The mint button gates on a 0.05 OG fee;
everything else is free to read.

## Deployments — Galileo testnet (chainId 16602)

| Contract | Address |
|---|---|
| YapFighter (ERC-7857) | `0xc2A82B1c6cb820ccf0C7732F40733A4101615CA2` |
| BattleEscrow | `0xC3a196f1e25485E1059199c2F4D2afdd07043Cb8` |
| BattleRegistry | `0x8A665bd7dFed87A1d6B87f1e5ecbc70E08fb7bD3` |
| YapMarketplace | `0xf4e65e53b203E4EF64Fedfe0C77BD83C56f7CEf1` |
| RentalEscrow | `0xad7b130d1ED52e33F1c64C7349E4994423e19E5b` |
| MomentINFT | `0xde6f1Ad216B2de19DBE5418c278DDbec1633092f` |
| MomentMarketplace | `0xDC77b8a4BE9C1aaAAFb80a3342A457700E070c20` |
| YapSubnameRegistrar | `0xD9c17C941C6307FbBf4fB6A9959Fc6d7490CCb31` |
| YapInbox (A2A messaging) | `0xe92dB21A770c32a19795556C46D5c6a274955DBD` |

**TEE signer** (verified on Galileo): `0x83df4B8EbA7c0B3B740019b8c9a77ffF77D508cF`
for provider `0xa48f01287233509FD694a22Bf840225062E67836`.

**Mainnet (Aristotle, chainId 16661)**: deploy intentionally held until
0G Bug #6 (broker TLS cert validation) clears upstream. Per ARCHITECTURE.md
gating policy.

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

## What's novel

1. **Routing-proof TEE attestation for AI verdicts** — most TEE-attested
   inference projects sign the *output*. Yap signs
   `<reqSha>:<respSha>:<providerType>:<providerIdentity>:<tlsCert>`,
   binding the verdict to the exact request/response pair *and* the
   provider identity. A swap-attack provider can't forge another provider's
   verdict.
2. **Encrypted IP transfer narrative** — ERC-7857 sealed-key handoff
   replaces the original "fine-tune weights ship with the NFT" plan. We
   discovered fine-tune outputs were never re-loaded into battle inference
   (provider runs base model regardless). Cutting fine-tune turned a
   theatrical 7-minute mint into an honest 5-second mint without losing
   any guarantee — the encryption + sealed-key economy is the actual
   novelty, not the LoRA.
3. **Co-signed dispute resolution in rentals** — RentalEscrow's
   24h-window co-signed split gives renters recourse without giving
   Yap a refereeing role. Platform fee scales inverse to renter-favor:
   a 100% renter refund pays *zero* protocol fee.
4. **Render-driven first-access ceremony** — splash dismissal is tied to
   data hooks ready (`checking → gating → done` phases with
   MIN_GATE_MS / POST_READY_GRACE_MS / HARD_TIMEOUT_MS), not a static
   timer. Reduced-motion preference respected; sessionStorage-gated to
   first access only.

## Defensive hardening (Phase-3 audit pass)

Beyond the four core primitives, the contract layer ships a set of
defensive guarantees that surfaced during a comparative audit against
peer 0G projects (anima, Aegis-Vault, lattice, EIDOLON, Coal).

| Surface | Guarantee |
|---|---|
| **0G DA anchoring** | `BattleEscrow.submitVerdict` low-level staticcalls the DA-layer DASigners precompile at `0x...1000`, records the current epoch into `battleDAEpoch[battleId]`, and emits `BattleDAAnchored(battleId, epoch)`. Lifts Yap to a 4-of-5 0G primitive integration (Storage + Compute + Chain + DA). Falls through to zero on non-precompile chains, never blocking settlement. |
| **EIP-2981 royalties** | Battle Moments are minted with a `RoyaltyInfo { minter, royaltyBps }` record (250 bps default, 1000 bps cap). MomentINFT exposes both the brief-mandated `getRoyaltyInfo` view and the standard EIP-2981 `royaltyInfo` shape. Clones inherit the parent record; only the minter can mutate. The shared `YapMarketplace` settlement path probes EIP-2981 via staticcall and credits the receiver before paying the seller — Fighter sales degrade to zero royalty gracefully (no EIP-2981 surface), Moment sales pay the creator on every secondary trade. |
| **Cross-chain proof binding** | YapFighter + MomentINFT bind `block.chainid` into the inner proof hash inside `_boundProofId`. A proof attested on Galileo cannot replay on Aristotle (or vice versa) even if a TEE verifier key were reused during a migration window. Off-chain verifiers mirror the same derivation. |
| **PersonaAccessed audit log** | YapFighter exposes `logAccess(tokenId, battleId)` — gated to the owner or any authorized executor — which increments `getAccessCount(tokenId)` and emits `PersonaAccessed(tokenId, accessor, battleId, timestamp)`. Every inference round leaves a public audit trail; revoking an executor immediately stops their ability to add entries. |
| **Slither CI gate** | `.github/workflows/slither.yml` runs on every push/PR touching `contracts/**` with `fail-on: high`. Local baseline against current main is **0 high-severity findings**; the badge surfaces on the project README. Medium-severity items stay visible in CI logs without blocking merges. |
| **Asymmetric force-close fairness (H audit)** | `RentalEscrow.forceCloseRental` matches the peer-audited anima `AnimaMarket.forceClose` on the two guarantees that matter — engaged-provider protection (dispute-free rental at timeout → owner is paid, not the renter) and no-fee buyer/renter refund on the dispute branch. On the `_settleSplit` path Yap goes *further* than anima: the platform fee is scaled to the **owner's share only**, so a 100% renter refund pays *zero* protocol fee. Anima charges a flat 5% on every dispute resolution including 100%-buyer outcomes. |

## What we surfaced upstream

8 distinct bugs reported to the 0G team during this hackathon:

| # | Layer | Issue |
|---|---|---|
| 1 | Storage SDK | MemData double-buffer copy regression (1.2.6) |
| 2 | Compute SDK | ESM Wallet identity mismatch on dynamic import |
| 3 | Broker | Verdict signature lacked replay protection — **fixed in 0G PR #479** |
| 4 | Broker | TLS cert in routing proof was empty for some providers — **fixed in 0G PR #479** |
| 5 | Provider models | `models: []` degraded state served as healthy |
| 6 | Broker | TLS cert validation gap in mainnet path *(open — gates Yap mainnet deploy)* |
| 7 | Storage | `txSeq` derivation timing on rapid sequential uploads |
| 8 | Compute | Fine-tune `taskStatus` polled `nil` after job graduation |

Yap functions as the deepest hackathon consumer of the 0G fine-tune flow —
hence the bug volume. From here, the 0G primitives have a real
test-bench, not a checkbox.

## Submission checklist

- [x] Verifiable AI combat arena live on Galileo
- [x] Mint flow ≤10s end to end
- [x] TEE-attested verdicts on-chain
- [x] Marketplace + rentals + Battle Moments
- [x] Subname registry (ENS-style, label → tokenId)
- [x] A2A encrypted inbox (stateless event-only)
- [x] Cosmetic audit pass — wire-or-drop applied throughout
- [ ] Demo video uploaded
- [ ] HackQuest project page submitted
- [ ] X launch post

## Screenshots to include

Order them this way in the form:

1. **Marketing landing** — Promoter direction hero with stat strip + featured battle teaser
2. **Mint wizard** (step 4 — review) — phase indicator with Voltage cut-corner button
3. **Live battle arena** — split corners, HP/Logic/Wit segmented bars, reaction tally
4. **Verdict reveal** — winner card overshoot scale + signed text panel
5. **Marketplace** — fighters tab grid with RecordBadge + crimson stamp
6. **Vault → Moments tab** — minted Battle Moment cards
7. **Settings / Subname** — `kompor.yap.0g` resolved
8. **Leaderboard** — Top ELO with archetype filter + pagination

Capture at 1920×1080, downsize for the form's image input limits.
