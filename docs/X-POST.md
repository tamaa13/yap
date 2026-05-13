# Yap — X / Twitter launch posts

Three candidate threads. Each post stays under 280 chars.

---

## Candidate A — bug-cred lead (recommended)

**Thread 1/4 — hook**

> Built Yap for the 0G APAC Hackathon: verifiable AI combat arena.
> Surfaced 8 SDK + provider bugs to @0G_labs while building.
> Half got fixed in PR #479 — which cites our report by name.
> Real consumer of the stack, not a checkbox demo.
> 🧵

**Thread 2/4 — what it is**

> Each fighter is an ERC-7857 INFT. Encrypted persona on 0G Storage,
> sealed key on-chain. Three-round AI debate runs in 0G Compute TEE.
> The same provider that runs inference signs the verdict via
> routing-proof attestation. Settled on 0G Chain. No Yap oracle key.

**Thread 3/4 — the novel bit**

> Most TEE-attested AI signs the output.
> Yap signs <reqSha>:<respSha>:<providerType>:<identity>:<tlsCert>.
> Binds the verdict to the exact req/resp pair AND the provider identity.
> A swap-attack provider can't forge another provider's verdict.
> Fail-closed if the chain breaks.

**Thread 4/4 — try it**

> Live on 0G Galileo testnet:
> 🥊 https://yap-arena.xyz/
> 📝 github.com/tamaa13/yap
> Mint a fighter in 5s. Pick a topic. Watch them yap.
> Marketplace + rentals + Battle Moment INFTs all wired.
> #0G #ERC7857 #AIxCrypto

---

## Candidate B — single-shot, no thread

> Yap: verifiable AI combat arena on @0G_labs.
>
> Fighters = ERC-7857 INFTs (encrypted persona on 0G Storage).
> Verdicts = TEE-signed by 0G Compute, settled on 0G Chain.
> No Yap-controlled oracle.
> Surfaced 8 bugs upstream — half fixed in PR #479.
>
> 🥊 https://yap-arena.xyz/

279 chars. Use this if you want one post instead of a thread.

---

## Candidate C — narrative lead

**Thread 1/3**

> A fighter shouldn't be a JPEG with stats.
> It should be an encrypted character that can argue for itself,
> earn ELO, get rented out, evolve over time, and travel between
> wallets without ever revealing its persona to the chain.
>
> That's Yap. Built on @0G_labs for the APAC hackathon. 🧵

**Thread 2/3**

> Mint = upload encrypted persona to 0G Storage, sealed key on-chain. ~5s.
> Train = re-seal with new lines, additive event log. Continuous learning,
> independently auditable.
> Battle = 3 rounds of TEE inference + a verdict the chain can verify
> without trusting Yap.

**Thread 3/3**

> 8 bugs reported upstream. PR #479 cites our report. Mainnet held until
> Bug #6 clears — we don't ship on broken primitives.
>
> 🥊 https://yap-arena.xyz/
> 📝 github.com/tamaa13/yap

---

## Suggested visual

For any of the candidates, attach the **verdict reveal** screenshot —
crimson stamp, winner card, signed text panel visible. That's the most
"this is real" image we have.

For Candidate A's thread-1 post, also pin the demo video reply once
uploaded.

## Post timing

- **First post**: right after HackQuest submission goes through, while
  the brand is fresh
- **Reply with video**: 30 min later (let the first post breathe)
- **Tag**: @0G_labs, @hackquest_io
- **Hashtags**: #0G, #ERC7857, #AIxCrypto, #APAC2026 (max 3 per post)
