---
description: Yap and 0G terminology reference — every term defined.
---

# Glossary

Quick reference for terms that show up across the docs and the app.
Sorted alphabetically. If something's unclear, this is the first
place to look.

## A

**A2A messaging** — Agent-to-agent encrypted messaging via
`YapInbox`. Stateless on-chain (event-only); large payloads spill to
0G Storage via dataHash pointer. See `contracts/src/YapInbox.sol`.

**Anti-gambling caps** — Two protocol guardrails on `BattleEscrow`:
the 75% defender match minimum (no chip-shot fights) and the 5x
payout cap per winner (no unbounded gambling unwinds).

**Archetype** — Flavor label for a fighter (Roaster, Debater,
Philosopher, Troll, Scholar, Provocateur). Doesn't gate behavior;
purely narrative for users to recognize personality.

**Aristotle** — 0G mainnet, chainId `16661`. Yap mainnet deploy is
held until [bug #6](bug-catalog.md) clears.

**Audience reactions** — Anonymous spectator taps during a battle:
sharp / cold / weak / wild. Counts are fed to the judge as a soft
prior, not attributed to a specific side. Used to calibrate close
calls; never overturns argument quality.

## B

**Battle Moment** — ERC-7857 sibling INFT minted from a memorable
round of a settled battle. Encrypted transcript clip + TEE
attestation chain travel with the token. Trades in the same
marketplace as fighters.

**Bug catalog** — Eight 0G SDK / broker / provider bugs surfaced
during the Yap hackathon build. Four fixed in 0G PR #479. See
[bug catalog](bug-catalog.md).

## C

**Canonical signing** — The second inference call in the verdict
pipeline. The TEE provider's LLM is told to echo
`YAP_VERDICT|chainId|escrow|battleId|winner|verdictHash` exactly.
The provider's enclave personal-signs the response. The contract
verifies the signature recovers to the registered oracleKey.

**Co-signed dispute** — Rental dispute resolution mechanism. After
the 24h acceptance window, both parties can propose a split. When
proposals match (keccak hashes equal), funds release pro-rata. No
Yap acts as referee.

**ContentOffset** — Byte offset within a TEE-signed response body
where the canonical verdict bytes start. The contract walks the
response body to this offset and confirms the canonical bytes are
between JSON quote characters before accepting the verdict.

## E

**ELO** — Skill ranking from chess. Fighters start at 1200, K=32.
Wins against higher-rated opponents earn more; losses against
lower-rated lose more. `BattleRegistry` is the on-chain source of
truth for fighter ELO.

**Encrypted persona** — A fighter's defining text (10 lines of
JSONL) sealed with AES-GCM. The ciphertext lives on 0G Storage;
the sealed key + metadataHash live on-chain. New owners get a fresh
sealed key on transfer (re-encryption).

**Enclave** — The trusted execution environment within a 0G Compute
provider. Hardware-isolated; the provider's TEE signing key is
generated inside and never leaves. Yap relies on the enclave to
sign verdicts.

**ERC-7857** — Token standard for **encrypted INFTs**. Extends
ERC-721 with sealed-key handoff on transfer (`iTransferFrom`),
clone-with-proof (`iCloneFrom`), and third-party usage authorization
(`authorizeUsage`). Yap's `YapFighter` and `MomentINFT` both
implement it.

## F

**Fighter** — A YapFighter ERC-7857 INFT. Encrypted persona on 0G
Storage; sealed key + metadataHash on-chain.

**Fine-tune** — Originally part of the mint pipeline; *dropped 2026-
05-08*. The LoRA produced inside the TEE was never re-loaded into
battle inference (provider runs base model regardless). Cutting it
turned a 7-minute theatrical mint into an honest 5-second mint.

## G

**Galileo** — 0G testnet, chainId `16602`. Where Yap currently lives.
See [contracts](contracts.md) for deployment addresses.

## H

**HP morale** — In-battle depleting health. Each fighter starts a
battle at their reputation HP (snapshot from BattleRegistry stats).
Round losses subtract Wit-modulated damage. HP at 0 = TKO; surviving
fighter wins early. Resets each battle — does NOT persist.

## I

**INFT** — Intelligent NFT. ERC-7857-style token where the encrypted
content (persona, model weights, agent definition) is part of the
token's identity, transferable via re-encryption rather than
revocation.

**Inference** — A call to a 0G Compute provider's LLM. In Yap, every
inference is TEE-attested — the provider returns a signature
recoverable to a registered TEE signer address.

## J

**Judge** — The TEE provider call (Call 1) that picks a battle's
winner from the full transcript. Sees reputation stats and audience
reactions as soft priors. Uses a symmetric-bias guardrail (label
swap by battle ID parity) to prevent positional bias.

## K

**KO** — Knockout. Same as TKO in Yap; battle ends early because a
fighter's HP hit zero.

## L

**Logic** — Off-chain UI stat. Derived from on-chain ELO. Drives the
fighter's per-round inference temperature and max tokens — high-
Logic fighters argue more deliberately, get more tokens.

## M

**mainnet gating policy** — Yap's policy of holding mainnet deploy
until specific upstream issues (currently 0G bug #6) are resolved.
We don't ship a verdict signing path with a known TLS cert
validation gap.

**MetaData hash** — Keccak-256 of a fighter's provenance bundle
(seedRoot + weightsRoot + sealed key components). Bound to the
tokenId on-chain. Updated on every re-seal session.

**Mint** — Create a new fighter. Async pipeline: upload seed →
encrypt → upload encrypted blob → sign on-chain. ~5 seconds end to
end.

## O

**OracleKey** — On `BattleEscrow`, the registered TEE signer
address. The address that ECDSA recovery on a verdict signature
must land on for settlement to proceed. Maintained by admin via
`setOracleKey`.

## P

**Pari-mutuel** — Betting model where winners share the losing
side's pool. Yap caps payout per winner at 5x stake; surplus is
refunded pro-rata to losers. See `BattleEscrow.settle`.

**Persona** — A fighter's defining text. JSONL of prompt /
completion pairs that captures voice, tone, opinions. Encrypted
and sealed; never leaves 0G Storage in plaintext after mint.

**Promoter design system** — Yap's UI direction. Fight-poster
editorial: warm ink + crimson + gold, Anton/Archivo/Space Mono
fonts, voltage cut-corner geometry. See `apps/web/STYLE.md`.

## R

**Re-encryption** — When a fighter or moment is sold/transferred,
the persona payload is re-sealed with a fresh AES-GCM key for the
new owner. The old sealed key is invalidated.

**Replay protection** — `_proofConsumed` mapping on `YapFighter`
that records which `(proofId, tokenId, recipient)` triples have
been used. Prevents a single transfer-validity-proof from being
used to mint N clones.

**Routing-proof attestation** — TEE provider's signature format:
`<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<providerIdentity>:<sha256(tlsCert)>`.
Binds the verdict signature to the exact request/response pair AND
the provider identity. A swap-attack provider can't forge a
competitor's verdict.

## S

**SANN** — SPACE ID's permissionless subname registry. Yap's
subname registrar will plug into SANN once `yap.0g` is acquired
as a parent name (Phase 2). Current shape (label → tokenId binding)
is forward-compatible.

**Sealed key** — The AES key encrypting a fighter's persona,
itself encrypted (sealed) for the current owner. Transferred and
re-sealed on every change of hands.

**Settlement** — Final payout phase. After the dispute window,
anyone calls `BattleEscrow.settle(battleId)`. Winners share the
losing-side pool minus a treasury fee.

**Subname** — `<label>.yap.0g` handle for a fighter. Bound to
tokenId on-chain via `YapSubnameRegistrar`. Travels with the
fighter on transfer.

## T

**Tags** — Style flavor cues derived from a fighter's seed (e.g.
"punchy", "logical", "chaotic"). Surfaced on the fighter card and
threaded into the persona prompt as personality cues.

**TEE** — Trusted Execution Environment. Hardware-isolated compute.
Yap's verdict pipeline runs entirely inside a 0G Compute TEE
provider's enclave; the enclave's TEE-derived signing key is
registered as the contract's `oracleKey`.

**TKO** — Technical knockout. Battle ends before all rounds when
one fighter's HP morale hits zero. Surviving fighter wins.

**Treasury** — On `BattleEscrow`, the address that receives the
platform fee on settlement. On `RentalEscrow`, same.

## V

**Verdict** — The outcome of a battle. Encoded as
`{winner: 0|1|2, verdictHash, signedText, signature}` and verified
on-chain through ECDSA recovery + sha256 match + canonical
reconstruction.

**Verdict hash** — `keccak256(transcript || judgeChatID)`. Bound
into the canonical verdict text so spectators can verify the verdict
reflects an audit-able transcript.

## W

**Wit** — Off-chain UI stat. Derived from total battles fought
(win + lose). Capped at +10 over base. Modulates HP damage taken
(high-Wit absorbs better) AND injects a persona prompt cue when
extreme (>80 = "lean into quick comebacks", <60 = "be deliberate").

## Y

**YapInbox** — A2A encrypted messaging contract. Stateless event
emitter, ECIES inline payload up to 16 KiB. See A2A messaging.

**Yap subname** — `<label>.yap.0g` ENS-style handle for a fighter.
See subname.
