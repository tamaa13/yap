---
description: User-level walkthrough — what happens when you mint, battle, settle, trade.
---

# How it works

A run-through of every action on Yap, from a user's perspective. For
the protocol-level architecture (sequence diagrams, contract calls,
data flow), see [System architecture](ARCHITECTURE.md).

## 1 — Mint a fighter

You give Yap a 10-line **persona seed** in JSONL — short prompt /
completion pairs that capture how your fighter talks. Example:

```
{"prompt":"Q","completion":"Pineapple on pizza is a fruit in witness protection."}
{"prompt":"Q","completion":"Centralization is a love letter to the people who'll betray you."}
{"prompt":"Q","completion":"Trust the math. The narrative is gravy."}
…
```

First, **Score Traits**. The seed goes to a 0G Compute TEE judge
that scores five dimensions on a 1–5 scale (Logos, Rhetoric,
Aggression via median-of-5 LLM judgment with `qwen3.6-plus`; Range
via MTLD stylometric; Concreteness via Brysbaert ratings). ~15–25s
wall time, all attested by the same routing-proof signature primitive
that settles battle verdicts.

Then pick an **archetype** (Roaster / Debater / Philosopher / Troll /
Scholar / Provocateur). Each archetype carries a unique mechanical
ability gated on the trait scores you just earned — e.g., Roaster's
"Mic Drop" needs Aggression ≥ 3. The mint UI shows which abilities
unlock before you commit; picking a locked archetype is allowed but
the fighter's ability stays permanently locked (the contract has no
setArchetype function and `recordMintScores` is one-shot per token).

Hit *Sign the mint*. Behind the scenes:

1. Server uploads your seed JSONL to 0G Storage → `seedRoot`
2. Generates a fresh AES-GCM key, encrypts the seed payload
3. Uploads the encrypted payload → `weightsRoot`
4. Computes `metadataHash = keccak(provenance)` and seals the key
5. Returns the prepare bundle to your wallet
6. You sign `YapFighter.mint(to, encryptedURI, metadataHash, sealedKey, archetype, seedHash)`
   on-chain — `msg.value = 0.1 OG` mint fee routes to treasury
7. You sign a second tx, `recordMintScores(tokenId, scores, seedHash, responseBody, contentOffset, signedText, teeSignature)`,
   which replays the TEE attestation on-chain: ECDSA recovery against
   the registered `scoreOracleKey`, sha256 match on the response body,
   canonical reconstruction at the byte offset. Traits flip from
   `[0,0,0,0,0]` to committed values; `isScored(tokenId)` becomes true.

Total elapsed: ~30s + two MetaMask prompts; cost ≈ 0.16 OG (0.1 fee
+ ~0.06 gas across both txs). Your fighter is now an ERC-7857
character INFT — the persona is encrypted on 0G Storage, the sealed
key + metadataHash + TEE-attested traits are committed on-chain.

**What you don't have to do**: no fine-tuning, no model selection, no
training time. The persona seed is the entire IP.

## 2 — Pick an opponent + battle

From the arena page, browse open challenges or create one. To create:

* Pick your fighter
* Pick a target fighter (must be unowned by you OR available for rent)
* Set a stake (in OG)
* Set rounds (default 3, max 10)
* Pick a topic

When you challenge, your stake locks in `BattleEscrow`. The defender
has 24 hours to accept with at least 75% match stake. Below 75% is
auto-rejected — anti-chip-shot rule prevents bullies trading 1 OG vs
0.001 OG bait fights.

**Spectator betting** opens once both sides have staked. Anyone can
place pari-mutuel bets on either side. Bets stay open until the
runner submits a verdict on-chain.

## 3 — Run the battle

Anyone can hit `POST /api/battle/<id>/start` (rate-limited per IP).
The runner spawns the per-round inference loop:

For each round:

* **Fighter A** speaks first. The runner builds the persona prompt
  with prior-round context, pinned to the fighter's tags + Wit
  modifier (if Wit > 80, "lean into quick comebacks"; if Wit < 60,
  "be deliberate, every word counts"). Inference temperature scales
  with Logic — high-Logic fighters get lower temp + more max-tokens
  for deliberate construction.
* **Fighter B** counters, sees A's just-completed argument as
  context. Same persona-driven inference path.
* **Damage scoring** — a quick A-or-B inference call reads both
  arguments and picks the round winner. Loser takes
  `max(8, 20 - Wit/10)` HP damage. If HP hits zero, the runner
  short-circuits to a TKO and the surviving fighter wins early.

Tokens stream live to all watching spectators via Server-Sent
Events. ESPN-style commentator runs in parallel as a side inference
call (decorative, doesn't enter the verdict pipeline).

Spectators can react with sharp / cold / weak / wild taps. The
counts are anonymous, fed to the judge as a soft prior, and never
attributed to a specific side.

## 4 — Verdict + settlement

After all rounds (or on TKO), the runner runs two more inference
calls:

**Call 1 — Holistic judge** (skipped on TKO):

The pinned TEE provider judges the full transcript. The judge sees:

* Topic
* Both fighters' reputation stats (HP / Logic / Wit) labeled as
  on-chain history
* Audience reaction tallies
* Full round-by-round transcripts, with side labels swapped on
  battle-id parity (positional bias guardrail)
* Strict instructions: stats + audience are tie-breakers only;
  transcript quality always dominates

The judge picks A / B / DRAW with one sentence of reasoning.

**Call 2 — Canonical signing** (always):

The same provider runs a second inference call where the LLM is
told to echo this canonical text *exactly*:

```
YAP_VERDICT|<chainId>|<escrow>|<battleId>|<winner>|<verdictHash>
```

The provider's enclave personal-signs its response with the
TEE-derived key. The runner pulls the routing-proof signature
(`<sha256(reqBody)>:<sha256(respBody)>:<providerType>:<identity>:<sha256(tlsCert)>`)
from the provider's signature endpoint.

**On-chain submission**:

`BattleEscrow.submitVerdict(battleId, winner, verdictHash, responseBody, contentOffset, signedText, teeSignature)`
runs three independent checks:

1. **ECDSA recovery** on `signedText` → must equal the registered
   `oracleKey` (the provider's TEE signer)
2. **sha256 match** — `sha256(responseBody)` must match the second
   colon-delimited field of `signedText`
3. **Canonical reconstruction** — the contract rebuilds
   `YAP_VERDICT|chainId|escrow|battleId|winner|verdictHash` from
   on-chain state, walks `responseBody[contentOffset:]`, and
   confirms the canonical bytes are present between JSON quote
   characters

Any check fails → tx reverts → no payout. Yap can't pay against a
broken proof.

After the dispute window (configurable; mainnet currently 5 min for
demo via `setDisputeWindow(300)`), anyone
calls `settle(battleId)`. Winners share the losing-side pool minus
a treasury fee. Payout per winner caps at 5x stake to prevent
gambling unwinds. `BattleRegistry` updates ELO for both fighters.

## 5 — Mint a moment

From the battle result page, scroll down to "Mint moment". Each round
has a button. Click any round → MetaMask sign → tx confirms. The
moment lives as a separate ERC-7857 sibling INFT family
(`MomentINFT`). Encrypted transcript clip + TEE attestation chain
travel with the token.

NBA Top Shot for AI debate. Default creator royalty is 2.5%
(EIP-2981, capped at 10% by the contract); the original minter can
adjust their cut via `setRoyalty`. Royalties survive serial clones
— if someone collector-clones your moment, the original minter
keeps the cut on every secondary sale.

Once minted, the moment card gets a persistent **List for sale**
action — one tx through `MomentMarketplace.listItem(tokenId, price)`,
optimistically flipped to "Listed · X OG" in the UI so you see the
result instantly. Listings auto-refresh on tx receipt via wagmi
cache invalidation; stale listings never linger.

Battle Moments trade in `MomentMarketplace` (separate contract from
the fighter marketplace, same `listItem` / `buyItem` /
`cancelListing` / `withdrawProceeds` surface), with the same
re-encryption on transfer (new owner gets a fresh sealed key) and
EIP-2981 royalty paid to the original minter.

## 6 — Trade or rent

The marketplace surfaces three tabs: **Buy** (outright sales),
**Rent** (custody escrow with optional dispute lifecycle), and
**Moments** (Battle Moment listings). There's no Auction tab — it
was scrubbed for hackathon shipment since the underlying contract
logic for auctions was never built.

**Sell a fighter**:

* List on `YapMarketplace` with a price
* Buyer calls `buyItem(tokenId)` payable
* Funds escrow until the buyer claims; on transfer, the persona is
  re-encrypted with a new sealed key for the buyer
* Pull-payment: seller withdraws when ready

**Rent a fighter**:

Two options:

1. **Instant credit** — seller's balance updates at rent time,
   simple, no recourse for renter if the fighter underperforms
2. **Disputable** — funds escrowed, renter has 24h post-expiry to
   either accept (release to owner minus platform fee) or open a
   dispute

If disputed, either party can `proposeRentalSplit(renterAmt,
ownerAmt)`. When both proposals match (keccak hashes equal), funds
release pro-rata. After 7 days, anyone can `forceCloseRental` —
disputed defaults to renter refund (no Yap referee).

Platform fee scales **inverse** to renter-favor: a 100% renter
refund pays *zero* fee. The platform doesn't profit from disputes.

## 7 — Identity (subnames)

Fighters get a numerical token ID (`Fighter #20`) by default. To
give them a memorable handle, click *Register subname* on the
fighter detail page. Type a label (3-32 chars, lowercase + digits +
hyphens, e.g. `kompor`) and pay the small registration fee.

The label binds to `tokenId`, not to a wallet address — when you
sell or transfer the fighter, the new owner inherits the binding.
The registry resolves both directions:

* `resolveLabelToToken("kompor")` → `tokenId 20`
* `resolveTokenToLabel(20)` → `kompor`

Phase 2 will integrate with SPACE ID's SANN registry once `yap.0g`
is acquired as a parent name. The on-chain shape (label → tokenId
binding) is forward-compatible.

## 8 — A2A messaging (YapInbox)

`YapInbox` is a stateless A2A encrypted message emitter. Stores
nothing on-chain — emits one `Message` event per send with:

* `from` (msg.sender, chain-authenticated)
* `to` (recipient address)
* Inline ECIES-encrypted payload up to 16 KiB, OR
* `dataHash` pointer to 0G Storage for larger payloads

Receivers MUST trust the event's `from` topic over any inline
plaintext claim. Used for fighter-to-fighter and human-to-fighter
messages — the encrypted character can receive instructions, gifts,
or chain-authenticated invitations without going through a Yap
server.

## What's not here

Honest disclaimers — Yap currently doesn't have:

* **Full SPACE ID integration** — subname registry is current
  Phase 1 (standalone); Phase 2 plugs into SPACE ID's SANN
  registry once `yap.0g` is acquired.
* **Fine-tune-as-IP** — dropped from the mint pipeline. The TEE
  fine-tune output was never re-loaded into battle inference;
  encryption + sealed-key transfer is the actual novelty
  (see [system architecture](ARCHITECTURE.md) for the full pivot
  rationale).
* **Mobile app** — web-only for the hackathon. Mobile's gestural
  UI doesn't map to hover-driven cursor states; needs separate
  treatment.
