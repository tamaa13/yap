═══════════════════════════════════════════════════════
YAP — Page mocks (Phase C of revamp)
═══════════════════════════════════════════════════════

Continuing from the prior session where you delivered the design system at `design-system.html`. We're keeping ALL design tokens, primitives, and visual rules from that. Now I need 5 hi-fi page mocks built directly on that system.

Use everything already locked in:
- **Promoter direction** — warm ink + cream + crimson + gold + bruise palette
- **Voltage cut-corner buttons** — `clip-path` polygon angled bottom-left
- **Anton display + Archivo body + Space Mono numbers**
- **6-variant badge family** — Stamp / Tape / Mono / Token / Split / Record (use the right one per context — fight vocab, not generic dApp pills)
- **Motion timing tokens** (`--yap-t-fast/base/med/slow`) — visible in component states (hover, focus, press)
- **Cut-corner clip paths** (`--yap-cut-sm/md/lg`)
- **Shadow + glow tokens** (`--yap-sh-1/2/3`, `--yap-glow-crimson/gold`)

Reference the live demo at http://103.150.227.197/ to compare against current UI — but design new mocks fresh, don't over-fit current layouts.

═══ DELIVERABLE — 5 page mocks

For each page, output:
1. **1440px desktop hero** — main viewport, 1440×900 minimum
2. **375px mobile shot** — responsive intent
3. **Component breakdown annotation** — list which primitives + badge variants used, where, why
4. **Motion notes** — what moves, when, which vocabulary (combat/data/navigation/ambient per MOTION.md)

═══ THE 5 PAGES

### 1. Marketing landing (`/`)

The most visually striking page. First impression for hackathon judges and prospective users.

Required elements:
- Hero block — "verifiable AI combat arena" headline, fighter-poster energy, NOT a SaaS gradient
- Logo lockup top-left (use the mark direction from prior brand foundation work)
- Primary CTA: "Mint a fighter →" (Voltage cut-corner button, crimson primary)
- Secondary CTA: "Watch a battle"
- Stat strip — total fighters minted, total battles settled, total OG escrowed, ELO leader (use **Split badges** for each)
- Featured battle teaser card — current live battle if any, with **Stamp** "LIVE" badge
- Connect wallet button (top-right)
- Below the fold: 3-step "How it works" (Mint → Battle → Trade), each illustrated with iconography from prior brand (combat vocab — punch, KO, ring, ropes, tape, glove, bell, mic, trophy, gavel, seal, chain, ticker)
- Featured fighters strip — 3-4 fighter cards with **Record** badges showing W-L

Must feel: "this is a fighting product I want to be part of." Not "this is a polite dApp."

### 2. Mint review step (`/mint` step 4)

The wizard's final step — user about to sign the on-chain mint. Highest-stakes moment in user funnel.

Required elements:
- Step indicator — 4 dots, last one active, Anton caps step labels
- Fighter preview card on the left, full-bleed:
  - Sigil/avatar (placeholder, ~120×120)
  - Name + archetype (display + body)
  - Style seed lines (3-5 quoted, mono-styled, scrollable)
  - Tags (use **Mono badge** for each)
- Right column — review pane:
  - Mint summary (fee, gas estimate, confirmation timeline)
  - **Token badge** showing predicted tokenId (e.g. `[ #?? ]` placeholder until contract assigns)
  - Privacy disclosure ("Persona seals to your wallet via ERC-7857")
  - Primary CTA: "Sign the mint" (Voltage cut-corner)
  - Cancel link below (ghost)
- Bottom strip — abridged STYLE.md voice "you are entering the arena"

Must feel: "I am about to commit something real, and the system respects that."

### 3. Battle live arena (`/arenas/[battleId]`)

Heart of the demo. Where the cryptographic primitives become visible UX. Most layout-dense screen.

Required elements:
- Top bar — battle ID **Token badge** + topic + round indicator (e.g. **Split badge** "ROUND / 2 of 3")
- Left panel — Fighter A (Corner A — **CRIMSON**)
  - Sigil + name + archetype
  - **Record badge** (W-L)
  - **HP/Logic/Wit segmented bars** (already have HPBar component — Promoter-skinned)
  - ELO **Split badge**
  - Speech bubble area — currently streaming token (subtle breathing)
- Center column — round dynamics
  - Round transcript scroll, prior rounds collapsed, current round expanded
  - Reaction tally (sharp/cold/weak/wild) — each is a **Token badge** with count
  - **Stamp** "VERDICT" overlay if round just finished
- Right panel — Fighter B (Corner B — **GOLD**)
  - Mirror of left layout, gold-tinted
- Bottom band — Live commentator
  - **Tape badge** for the commentator handle ("LIVE COLOR" or operator handle)
  - Ticker chunk slides in from right per round
- Sticky chrome — viewer count, bet pool aggregate (**Split badges**), time elapsed

Must feel: "I am at ringside watching a fight unfold." Not "a chatbot interface."

### 4. Marketplace (`/market`)

Browse + filter + buy fighters. Plus new "Moments" tab.

Required elements:
- Tab strip — Fighters | Moments (underline tabs, layout-animated underline per MOTION.md)
- Filter bar — price min/max (input fields, mono numerics), archetype select, search
- Results grid — fighter cards, 4-up desktop / 1-up mobile
  - Each card: sigil, name (Anton h3), archetype (Archivo small caps), price (mono Split badge), W-L (**Record badge**), edition (**Tape badge** if rare), CTA "Buy" (Voltage button)
  - Hover: lift + tilt + crimson accent border (no scale-1.05 trap — translate + shadow)
- Empty state — "No fighters listed. The next one's yours." + opinionated CTA "Mint a fighter" Voltage button
- Top bar — total volume traded **Split badge**, top earner **Tape badge**

Must feel: "this is a fight card I'm browsing." Not "an NFT grid."

### 5. Battle result / verdict (`/arenas/[battleId]/result`)

Post-fight reveal. Where Yap's TEE attestation chain becomes the headline.

Required elements:
- **Stamp** "VERDICT" hero banner — large, crimson, cut corner, Anton caps
- Winner card centerpiece — Fighter A or B, scaled up, with overshoot motion entry (note in annotation)
- Loser card secondary — dimmer, gold-tinted "lost"
- Judge reasoning quote — Archivo italic, 1-2 sentences from the judge transcript
- Per-round transcripts — collapsible accordions, mono numbers for round indicators (**Token** "[ R1 ]")
- Settlement strip:
  - Verdict tx hash **Token badge**
  - TEE provider attestation **Tape badge** ("Signed by 0x83df…08cF")
  - On-chain ECDSA recovered **Stamp** "VERIFIED" if settle succeeded
- Mint-a-Moment row — per round, **Tape badge** with "MINT MOMENT →" Voltage button if user owns the side
- Settle / Claim buttons (primary cut-corner, gold-tinted for "claim purse")

Must feel: "this fight is fully settled, on-chain, and the math is verifiable." Not "a generic 'completed' screen."

═══ COMPOSITIONAL RULES (CARRY FROM PRIOR SESSION)

- **Specific over generic** — every label references real fighter/round/amount, not placeholders like "Item Name" or "$0.00"
- **One Stamp per surface max** — Stamp is loud, don't repeat. Other badge variants can repeat freely.
- **Tape badges should rotate ~−1.5°** — feels physical
- **Mono numbers** for ALL tokenIds, addresses, ELO, OG amounts, gas, prices, percentages
- **Anton in caps** for display headings + Stamp/Record badges
- **Archivo regular** for body, **Archivo bold** for emphasis
- **Cut-corner clip paths** on buttons + Stamp + select cards (don't overuse — pick where it lands)
- **Crimson glow** only at impact moments (verdict reveal, KO stamp), never decorative idle
- **Cream paper backgrounds** ONLY on Tape badge + modal chrome (not page-wide; pages stay dark warm-ink)

═══ ANTI-PATTERNS (RECONFIRM FROM BRIEF)

- ❌ NO generic dApp gradient hero
- ❌ NO glass-morphism cards  
- ❌ NO neon "play to earn" energy
- ❌ NO uniform card grids (vary at least one per page)
- ❌ NO "Click here to..." copy
- ❌ NO blue/orange "boxing corner" cliché — Crimson/Gold instead

═══ OUTPUT FORMAT

Per page:
```
[Page name]
---
[Desktop 1440px PNG]
[Mobile 375px PNG]
[Component breakdown annotation]
[Motion notes]
```

End with summary: cross-page consistency check, design tokens used, any new tokens proposed (with justification).

═══ AUDIENCE REMINDER

Hackathon judges (May 16 deadline) will see these mocks live. They need to:
1. Recognize visual identity instantly ("this is a fight product")
2. Understand the cryptographic primitives via UI surface (TEE attest, on-chain verify, INFT seal)
3. Feel premium, not template

Make it look like the platform I'd actually launch on mainnet, not a hackathon throwaway.

═════ END PROMPT ═════
