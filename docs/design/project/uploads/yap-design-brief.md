═══════════════════════════════════════════════════════
YAP — full UI revamp brief (Tier 3, all pages)
═══════════════════════════════════════════════════════

I'm building Yap, a verifiable AI combat arena dApp on the 0G blockchain. I want to revamp the UI end-to-end. Below is the product, the current state, the problems with current UI, the visual direction I want, and the deliverables I need from you.

Live demo URL (open this and screenshot pages as you work — current UI for reference):
http://103.150.227.197/

══════ 1. WHAT YAP IS ══════

- Each fighter is an ERC-7857 character INFT (encrypted persona on 0G Storage, transferable via sealed-key re-encryption).
- Two fighters battle in 3-round AI debates. A pinned 0G Compute TEE provider runs the inference per round AND signs the verdict via a routing-proof attestation chain. BattleEscrow verifies the signature on-chain.
- Pari-mutuel betting on outcomes; outside bettors and the two fighter owners stake.
- Marketplace + rental + custody-based dispute resolution (anima-pattern co-signed split).
- "Battle Moments" — outstanding rounds can be minted as separate ERC-7857 collectibles (NBA Top Shot for AI debates).
- Live ESPN-style commentator that streams alongside the fighters.
- Subname registrar — `<label>.yap.0g` for human-readable fighter names.

This is a fighting arena economy, not a SaaS dashboard.

══════ 2. CURRENT UI STATE (what to compare against) ══════

Stack: Next.js 16 + Turbopack, React 19, dark theme by default, custom CSS variables, RainbowKit for wallet, wagmi for chain reads.

Pages currently shipped:
- Marketing landing (`/`) — minimal hero, copy-only, dark gradient
- Mint wizard (`/mint`) — 4-step flow: style seed → archetype → name+avatar → review+sign. Phase indicator dots, success card. Just got Framer Motion phase punch animation.
- Vault (`/vault`) — 4 tabs: My Fighters / Listings / Rentals / Moments. Card grids 4-up.
- Fighter detail (`/fighters/[tokenId]`) — overview + history + earnings tabs; train modal; dispute panel for active rentals
- Marketplace (`/market`) — Fighters + Moments tabs, filter bar (price min/max, archetype, search), 4-up card grid
- Battle live arena (`/arenas/[battleId]`) — split fighter panels (HP/Logic/Wit bars + ELO/W-L), live token streaming speech bubbles with subtle "breathing" pulse, reaction buttons (sharp/cold/weak/wild), ESPN-style commentator ticker on a third lane, round divider with ±2px controller-rumble translate
- Battle pending (`/arenas/[battleId]` pre-accept) — defender accept/decline, stake input
- Battle result (`/arenas/[battleId]/result`) — verdict reveal card, judge reasoning, per-round transcripts, settle/claim buttons, mint-a-moment prompts per round
- Arenas list (`/arenas`) — open + live + settled battles, card grid
- Leaderboard (`/leaderboard`) — table: rank, fighter, archetype, ELO, win%, earnings, owner
- Profile (`/profile/[address]`) — owner's fighters + stats
- Rental detail / dispute panel — co-signed split UI, status windows
- Wallet (`/wallet`) — balance, recent txs

Visual conventions in current build:
- Dark theme `#0a0a0a` background, `#161616` elevated cards, `#2a2a2a` borders
- Accent: `#ffba49` warm orange for primary actions, success
- Mono font for tokenIds, addresses, ELO, OG amounts
- Buttons: solid filled primary, outlined secondary
- Cards: bordered, rounded 8-12px, no heavy shadow
- Badges: pill shape, mono case
- Iconography: line-weight Lucide icons, ~14-16px
- No logo mark currently (just text "Yap")

══════ 3. PROBLEMS — what's wrong with current UI ══════

Tama feedback: "AI slop" — the UI feels template-generated. Specifically:
- Visual hierarchy too uniform — every card looks like every other card
- Generic "dark theme dApp" feel that could be ANY blockchain product (compound, aave, uniswap clones)
- No distinctive identity — nothing visually says "fight" or "combat"
- Static motion fixed in pilot but the underlying VISUAL design is still SaaS-y, not arena-y
- Empty states + loading states are fine, but the BRAND doesn't punch
- Numbers, ELO, win counts presented like spreadsheet rows, not fight stats
- No iconography unique to combat
- Color palette is functional but forgettable
- Marketing landing is anemic — should be the most visually striking, currently isn't

══════ 4. WHAT I WANT — visual direction ══════

Anchor: combat dApp aesthetic, fight-game adjacent, sports-broadcast inspired.

Aspire to:
- Mortal Kombat / Tekken arcade HUD energy — fight stats, KO meters, round indicators, finishing-move emphasis
- ESPN bottom-third broadcast graphics — ticker bars, stat readouts, accent stripes, scorecard composition
- Uniswap V3 / Across bridge polish — clean, dense, technical, professional
- ENS subname registration UX — playful but precise around naming primitives

AVOID (do not reference for inspiration):
- Stripe / Linear minimal SaaS — too quiet
- Generic AI dApp templates — gradient blob hero, glass-morphism cards, pastel
- anima.os / agent ops dashboard energy — too utilitarian
- Web3 "play to earn" garish neon — too late-2021
- Crypto-bro / degen meme aesthetic — we want premium

Vibe attributes Yap should hit:
- Confident, blunt, a little bit cocky (matches our voice STYLE.md)
- Kinetic, tactile, fight-game-tuned (matches MOTION.md)
- Specific over generic (named fighters, named rounds, named moments)
- Premium feel without being corporate
- Indonesian + English bilingual ready (don't lock typography to single language)

══════ 5. DELIVERABLES I NEED ══════

5.1 BRAND FOUNDATION

- Logo mark + wordmark
  - Primary lockup
  - Square mark (favicon, social)
  - Treatment for dark + light backgrounds
- Color palette
  - Primary, secondary, accent
  - Semantic: success, danger, warning, info
  - Neutral scale (8-10 stops, dark and light)
  - Specific hex values + named tokens
- Typography
  - Display, body, mono — pick fonts (open-source preferred so I can drop into Next.js)
  - Type scale (caption / body / lead / h1-h4 / display)
  - Line-height + letter-spacing per scale
- Spacing scale (4px base recommended)
- Radius scale (sm/md/lg/full)
- Shadow tokens
- Motion timing aligns with existing MOTION.md (140ms fast / 240ms base / 400-500ms medium / 600-800ms slow). Don't change those — design within.

Output format: design tokens as CSS custom properties OR JSON, plus visual swatches.

5.2 COMPONENT PRIMITIVES

Show variants for:
- Buttons (primary, secondary, ghost, danger; sm/md/lg sizes; with icon, loading state, disabled)
- Cards (default, elevated, interactive/hover, with header/footer variants)
- Badges (mono, tone variants — success/danger/warning/info/neutral, with optional leading icon)
- Inputs (text, number, select, search, with label/helper/error states)
- Modals (sm/md/lg, with header + footer button group)
- Toasts (success/danger/info, slide-in from right)
- Tabs (underline + segmented variants)
- Tables (data-dense, with sort indicator, hover row)
- Empty states (illustration + opinionated CTA)
- Loading skeletons (per common card type)

5.3 PAGE MOCKS — full set, all pages listed in section 2

For each page, deliver:
- 1440px desktop hero shot (main viewport)
- 375px mobile shot (responsive intent)
- Annotation of components used, data hierarchy, motion notes

Pages list (all of these):
1. Marketing landing
2. Mint wizard — all 4 steps
3. Vault — all 4 tabs
4. Fighter detail — overview/history/earnings tabs, train modal, dispute panel state variants
5. Marketplace — fighters + moments tabs, filter bar
6. Battle live arena — mid-round with commentator + reaction tally
7. Battle pending — pre-accept defender view
8. Battle result — verdict reveal moment + per-round transcripts + mint-moment CTAs
9. Arenas list — open / live / settled
10. Leaderboard — table layout, mobile responsive
11. Profile (per address)
12. Rental flow — list / rent / active / dispute panel
13. Wallet
14. 404 / not-found
15. Connect wallet gate screen

5.4 ICONOGRAPHY

Custom icon set OR pick a base library + show how I theme it. Combat vocabulary needs: punch, KO, ring, ropes, tape, glove, bell, scorecard, microphone (commentator), trophy, dispute (gavel-adjacent), seal (encrypted persona), chain (on-chain), ticker.

5.5 KEY DEMO MOMENTS (must look stunning, these are recording targets)

- Mint complete — the moment a fighter materializes after the on-chain tx settles
- Verdict reveal — winner card lands with overshoot
- Mint Moment — outstanding round becomes collectible
- First battle live frame — when the arena lights up
- Marketplace fighter detail entry — FLIP-style transition

══════ 6. CONSTRAINTS ══════

- Dark theme is default (matches current). Optional light theme variant if you have time.
- Mono font for tokenIDs (#42), addresses (0x1d4D…c485D), ELO numbers, OG amounts. Choose a mono that pairs well with display.
- 0G Galileo testnet chainId 16602, mainnet (Aristotle) chainId 16661 — show in chain badge.
- Accessibility: contrast 4.5:1 minimum, keyboard navigation patterns called out, focus states designed.
- Mobile responsive (current build is desktop-first; revamp tightens mobile).
- No video, no audio (static mocks only) — motion lives in MOTION.md spec, not in design output.
- Output: high-fi PNG mocks per page (annotated), design tokens (CSS / JSON), component primitive sheet, logo files (SVG preferred).

══════ 7. AUDIENCE ══════

This UI revamp goes to:
1. 0G APAC Hackathon judges (deadline May 16, 2026) — technically literate, see many AI dApps, will reward distinctive identity
2. Yap users — fighter owners, bettors, dispute participants
3. Anthropic ecosystem visibility (we'll reference cross-pollination back to Yap GitHub repo)

Make it look like a product I'd actually launch on mainnet, not a hackathon throwaway.

══════ 8. WORKFLOW ══════

- You explore visual direction first (3-5 mood directions, low-fi)
- I pick one
- You apply to brand foundation (5.1) + primitives (5.2)
- I sign off
- You generate page mocks (5.3) + iconography (5.4) + key demo moments (5.5)
- I bring outputs back to my engineering team (yap-web subagent) to translate into React components, motion-aware

Total turn-around target: 2 days my side reviewing, 1-2 days you generating. I have engineering capacity to translate into code in parallel.

═════ END BRIEF ═════
