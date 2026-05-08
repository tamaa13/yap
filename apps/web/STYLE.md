# Yap voice & UI style — 1-pager

Anchor: **Specific. Brief. A little bit cocky.**

This is a fighting arena where AI characters argue for stakes. The UI
should feel like a player handing his fighter into the cage, not a
SaaS dashboard onboarding a customer.

## Voice rules

1. **Specific over generic.** Always reference the thing by name — fighter,
   token id, opponent, round number, stake amount. Generic copy ("Mint
   successful") is template energy; "Fighter #42 lives on-chain" sticks.
2. **Brief over polite.** "Cancel" not "Are you sure you want to cancel?".
   "Done." not "Operation completed successfully." Never apologize for an
   action the user just took.
3. **Confident, mild snark.** The product knows it's combat-themed; lean
   in. Allowed: "Pick your fighter." "Ship the punch." "Your move."
   Forbidden: "Welcome to Yap, the AI…" / "Click here to…" / "Please".
4. **Combat metaphor when natural.** Arena, ring, ropes, tape, knockout,
   verdict, opener, rebuttal. Don't force it — but if the literal action
   maps, use the metaphor.
5. **Talk to a player, not a user.** "Your fighter," "your opponent," not
   "the user's NFT." Imperatives ("Sign," "Stake," "Train") not
   helpdesk-passive ("Click to continue").
6. **No corporate hedging.** Cut "currently," "we're working on,"
   "please note that," "you may experience." If the system can do it,
   say so. If it can't, say what's wrong, in one line.
7. **Numbers earn their format.** Mono font for tokenIds, addresses, ELO,
   stake amounts, txHashes. Sentence case for prose. Avoid mixing.

## Tone matrix

| Context | Voice | Example |
|---|---|---|
| Empty state | Opinionated CTA | "No fighters yet. Mint one and find out who you are." |
| Success toast | Specific, past tense | "Fighter #42 lives on-chain. Time to test it." |
| Error toast | Direct cause + next move | "Stake rejected — wallet has 0.4 0G, you bet 1.0." |
| Loading | What's happening, not "loading" | "Sealing persona on 0G…" |
| Confirm dialog | Stakes-first | "Burn 1.0 0G to enter the ring?" |
| Disabled CTA tooltip | Why it's gated | "Defender hasn't accepted yet." |

## Forbidden phrases

- "Welcome to…"
- "Successfully …"
- "Please …"
- "Click here to …"
- "Are you sure you want to …"
- "Operation completed"
- "An error occurred"
- "Currently unavailable"
- "Your AI fighter" (it's just "your fighter")
- "Coming soon" (drop the feature or ship it)

## Before / after

| Before | After |
|---|---|
| "Your fighter has been minted successfully!" | "Fighter #42 lives on-chain." |
| "No items found" (vault) | "Empty vault. Win a battle, claim your purse." |
| "Are you sure you want to cancel this challenge?" | "Drop this challenge?" |
| "Welcome back, please connect your wallet" | "Connect to enter the arena." |
| "Click here to mint your fighter" | "Mint fighter →" |
| "Loading battles..." | "Spinning up the arena…" |
| "Mint successful · Token #42 minted" toast | "Fighter #42. Ready when you are." |
| "Insufficient balance" | "Need 1.0 0G — you have 0.4." |
| "Are you sure?" (delete listing) | "Pull the listing?" |

## Layout & component rules

- **Empty states** must include an opinionated one-line CTA. Never just
  "No items." Always: a verb the user can do *next*.
- **Loading states**: pick the verb that matches the work — "Sealing,"
  "Pinning," "Reading the chain," "Tallying votes." The default
  spinner-with-no-label is banned on the pilot screens.
- **Card grids**: vary hierarchy. If three cards in a row repeat the
  same internal layout, that's a refactor signal. At least one card
  per page should be sized or styled differently from the rest.
- **Numbers in prose**: mono font, two decimals for 0G amounts, no
  thousands separator under 10k, comma-separated above. Always include
  the symbol ("0G", "ELO", "%") on the same baseline.

## Apply this guide before scaling

Pilot screens (this round): mint review, battle complete/verdict, vault
landing. Once `main` signs off the voice on those three, the same rules
scale to the remaining pages. Until sign-off, do not touch other pages
just to align — pilot first, pattern second.
