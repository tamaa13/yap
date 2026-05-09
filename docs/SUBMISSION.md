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
- **Marketplace + rentals (anima dispute pattern)** — fighters and Battle
  Moments trade in a single marketplace with re-encryption on transfer.
  Rentals adopt the s0nderlabs/anima dispute pattern: 24 h acceptance
  window for co-signed splits, 7 d max lifetime, asymmetric platform-fee
  rebate when the split favors the renter. No Yap wasit.
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
| YapFighter (ERC-7857) | `0xd023b0c5b0ccc829dbf0b39df5e81aece4d36a24` |
| BattleEscrow | `0x4bd214fdfe925124c9e145e577ac860c0d93fb2e` |
| BattleRegistry | `0x755ef230d456b6cc991ccfff38ec5c6b0133d37b` |
| YapMarketplace | `0x076e42a64e4ba43700ebb0830086138468dfa275` |
| RentalEscrow | `0xe5Df2d51ef75A268daAd122038D94cEA9c3111EA` |
| FighterTrainer | `0xC10bd77cdA8300877898612B00608bA522d5a460` |
| MomentINFT | `0xf6cadAb5276A16b7C8213CD7B6BBB547f55be4AC` |
| MomentMarketplace | `0x18653aa16a4ffc7093be0270ab427688dfd2fb81` |
| YapSubnameRegistrar | `0xb84c024c3456b7c82ad8a08bf4b7c69804bbd56f` |
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
3. **Anima-pattern dispute resolution in rentals** — porting s0nderlabs
   anima's 24h-window co-signed split into RentalEscrow gives renters
   recourse without giving Yap a refereeing role. Platform fee scales
   inverse to renter-favor: a 100% renter refund pays *zero* protocol
   fee.
4. **Render-driven first-access ceremony** — splash dismissal is tied to
   data hooks ready (`checking → gating → done` phases with
   MIN_GATE_MS / POST_READY_GRACE_MS / HARD_TIMEOUT_MS), not a static
   timer. Reduced-motion preference respected; sessionStorage-gated to
   first access only.

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
- [x] Subname registry (anima pattern)
- [x] A2A encrypted inbox (anima pattern)
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
