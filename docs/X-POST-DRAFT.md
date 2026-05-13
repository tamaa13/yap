# X / Twitter launch posts — TEE-attested persona pivot

3 candidate threads. Each post stays under 280 chars.

Replaces / extends existing `X-POST.md`. Pick one, paste, ship.

---

## Candidate A — technical/builder voice

**1/5 — hook**

> Built Yap for the 0G APAC Hackathon.
> Verifiable AI combat arena where fighter stats are TEE-judged at mint and verdicts are TEE-signed at settle.
> Same routing-proof primitive twice. No off-stack signer anywhere.
> 🧵

**2/5 — persona scoring**

> At mint, the 0G Compute TEE judge reads your persona seed and scores 5 dimensions: Logos, Rhetoric, Aggression (LLM-judged, median-of-5), Range (MTLD), Concreteness (Brysbaert).
> Scores commit on-chain via the same canonical-echo + provider sig primitive that settles battle verdicts.

**3/5 — verifier**

> Same 3 checks gate both:
> 1. ECDSA recover signedText → oracleKey (provider's TEE addr)
> 2. sha256(respBody) match
> 3. canonical reconstruction at contentOffset
> Cross-chain, cross-contract, cross-token replay all blocked.
> Yap-key forgery = nonexistent because there's no Yap key.

**4/5 — depth**

> 6 archetypes, 6 unique mechanical abilities — Mic Drop, Counterpoint, Reframe, Derail, Cite Precedent, Bait — each gated by an attested trait threshold.
> Plus per-round stance picks (ATTACK / BUILD) signed by the owner.
> You don't watch your NFT. You play it.

**5/5 — try it**

> 🥊 http://103.150.227.197/
> 📝 github.com/tamaa13/yap
> Galileo testnet, 0.05 OG mint, faucet at faucet.0g.ai.
> 8 SDK + provider bugs surfaced to @0G_labs during build; PR #479 cites our report by name.
> #0G #ERC7857 #AIxCrypto

---

## Candidate B — narrative/storytelling voice

**1/5 — opening image**

> Imagine a debate where the personality of each speaker is signed by a TEE.
>
> Not the verdict.
>
> The personality.
>
> Before the debate even starts, a piece of hardware grades how well-argued the fighter's own seed text is. That number is what their stats become.
>
> That's Yap. 🧵

**2/5 — why it matters**

> AI combat dApps roll stats from a hash and tell you the JPEG can fight. Most people don't notice the seam.
>
> But it means the "Wit 92" above your fighter's head was never earned from anything. It was die-rolled at mint and labeled in retrospect.

**3/5 — what changes**

> Yap reads the persona you wrote.
>
> A TEE-attested judge scores Logos, Rhetoric, Aggression with median-of-5 LLM calls. Range and Concreteness drop out of stylometry — MTLD and Brysbaert norms — deterministic, no model in the loop.
>
> Stats become a measurement of writing skill, not luck.

**4/5 — the playable layer**

> Each round, a 5s window opens. The owning wallet picks ATTACK or BUILD for that round's stance. It threads into the TEE inference.
>
> Archetype abilities — Mic Drop (Roaster), Reframe (Philosopher), Bait (Provocateur), etc — gate on attested traits.
>
> You stop being a spectator.

**5/5 — close**

> Built solo, 0G APAC Hackathon.
> Galileo live now: http://103.150.227.197/
> Source: github.com/tamaa13/yap
> Same TEE primitive at mint and at settle. One trust assumption, end-to-end audit.
> #0G #ERC7857

---

## Candidate C — comparison voice

**1/4 — claim**

> AI combat games keep promising "stats matter."
>
> They never do. Stats are a hash function of your tokenId, dressed in a font.
>
> Here's what it looks like when they actually do. 🧵

**2/4 — what most ship**

> Standard build:
>   • mint NFT
>   • stats = keccak(seed) % range
>   • off-stack signer says who won
>   • UI shows stats next to the JPEG
>
> Stats never enter inference. The "Wit 92" fighter argues identically to the "Wit 12" one.

**3/4 — what Yap ships**

> 0G Compute TEE reads your persona seed at mint and grades it.
> 5 dimensions, signed by the same enclave that signs battle verdicts.
> Stats commit on-chain via a canonical-echo routing-proof.
>
> Then the stats gate archetype abilities. Then they thread into round-by-round inference. Then they decide damage.

**4/4 — try it**

> Live on 0G Galileo:
> 🥊 http://103.150.227.197/
> 📝 github.com/tamaa13/yap
>
> Mint a fighter. Read the judge trail. Sign your stance each round.
> Watch what "stats matter" looks like when it's true.
> @0G_labs #0G #ERC7857 #AIxCrypto

---

## Recommendation

**Candidate B (narrative voice)** strongest for broader reach — "imagine a debate where the personality is signed by a TEE" is an opening hook non-developers can read.

**Candidate A (technical voice)** strongest for dev-twitter / @0G_labs / hackathon judges — every line lands a specific architectural claim.

**Candidate C (comparison voice)** strongest if Yap is being positioned vs other AI combat dapps directly — but risks drawing fire from those projects' communities.

Pick based on which audience matters most for the demo window.

## Suggested visual

For any candidate, attach the **mint review screen** with the 5-score breakdown panel + archetype ability unlock indicator + signed canonical line visible. That's the single most "this is real" image we have.

For thread-1 posts, pin the demo video reply once uploaded.

## Post timing

- **First post**: right after HackQuest submission goes through
- **Reply with video**: 30 min later
- **Tag**: @0G_labs, @hackquest_io
- **Hashtags**: max 3 per post (#0G, #ERC7857, #AIxCrypto)
