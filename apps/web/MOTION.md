# Yap motion language — 1-pager

Anchor: **purposeful motion serves a narrative beat — never decoration**.
Combat dApp, not a Stripe-style admin. Speech bubbles breathe, verdict
hits land, ticker chunks ESPN-style — but routine UI gets out of the
way fast. Custom motion is a differentiator; Framer-from-tutorial
patterns aren't.

Library: **`motion`** (the rebrand of Framer Motion). Import path:
`motion/react`. Files using motion components are `"use client"`.
CSS transitions stay for hover micro-states only (button press, card
border, input focus); anything sequenced or stateful is `<motion.*>`.

## Four motion vocabularies

Each layer of UI gets a distinct movement signature. Mix them and the
demo feels generic; keep them apart and the app reads kinetic.

### 1. Combat — fighter speech, verdict, reactions
Aggressive easing. Earned overshoot. Brief impact moments.

- **Speech bubble breathing** while a fighter streams: scale `[1, 1.005, 1]`,
  duration ~400ms, ease `easeInOut`, repeat infinite. Stops the moment
  the round-complete event fires.
- **Verdict reveal** (winner card): scale `0.85 → 1.05 → 1.0` with
  overshoot ease `[0.34, 1.56, 0.64, 1]`, ~600ms. Drop-shadow expands
  from `0 0 0` to `0 8px 24px rgba(accent,0.18)`. One ambient glow
  pulse, then settle.
- **Round-complete impact**: parent transient translate (`±2px x 3 cycles, 50ms each`)
  for the round divider. Like a controller rumble — felt, not watched.
- **Reaction count slam**: number scales `1 → 1.25 → 1.0` with quick
  overshoot when count increments, ~250ms. Mortal Kombat damage-counter
  energy.

### 2. Data — numbers, balances, stats
Quiet. Monotone. No overshoot. Get out of the way.

- **Countup**: `useMotionValue` + `useTransform` + `animate()`, 600ms,
  ease `[0.25, 0.46, 0.45, 0.94]` (smooth deceleration). Used for
  ELO, 0G amounts, win counts. *Combat values* (verdict winner ELO)
  can borrow combat easing; passive feeds (vault balance) stay quiet.
- **Stat shift** (e.g. fighter stat update): single fade-through, 200ms.
  No flicker, no pulse.

### 3. Navigation — modals, tooltips, sheets
Functional. Fast. Dampened. Never overshoot.

- **Modal open**: scale `0.97 → 1.0` + opacity `0 → 1`, 180ms, ease
  `easeOut`. Backdrop fades synced. Close mirrors but faster (140ms).
  No bounce.
- **Toast slide-in**: from right edge, `x: '100%' → 0`, ease
  `[0.32, 0.72, 0, 1]` (snap with tiny tail), 240ms.
- **Tab switch indicator**: `layout` animation, ease `easeOut`,
  ~180ms.

### 4. Ambient — empty-state CTAs, idle accents
Subtle. Single drift. Never loop indefinitely on idle elements.

- **Empty-state CTA**: subtle `box-shadow` pulse on the primary button
  *only* on first mount, then settles. No infinite loops on idle UI.
- **Streaming caret**: existing `al-caret` keyframe (CSS), unchanged.
- Avoid: floating sine-wave icons, infinite logo rotation, scaling
  pulses on non-interactive elements.

## Easing palette (motion props)

```ts
// In-file constants — paste, don't import a token. Easing is small;
// the cost of a re-export is more cognitive load than the duplication.
const EASE_SNAP     = [0.32, 0.72, 0, 1]      as const; // nav, modal
const EASE_OVERSHOOT= [0.34, 1.56, 0.64, 1]   as const; // verdict, count slam
const EASE_OUT_DATA = [0.25, 0.46, 0.45, 0.94] as const; // countup, stat
const EASE_IMPACT   = [0.65, 0, 0.35, 1]      as const; // hits, settles
```

## Duration scale

| Token | ms | Use |
|---|---|---|
| `fast` | 140-180 | Hover, focus, modal close |
| `base` | 240-300 | Modal open, toast slide-in, count tick |
| `medium` | 400-500 | Round transitions, fighter reveal idle |
| `slow` | 600-800 | Verdict reveal, mint complete reveal |

Anything > 800ms on routine actions is forbidden.

## Forbidden — the AI-slop trap list

These are the patterns Framer tutorials default to. Avoid all of them.

- ❌ `whileHover={{ scale: 1.05 }}` blanket on cards. Use translateY +
  shadow expansion instead — feels like a physical card lifting.
- ❌ `initial={{ opacity: 0 }} animate={{ opacity: 1 }}` as default
  page-load. Routes don't need a fade unless something specific is
  transitioning *between* them. Default to no entry animation.
- ❌ `<AnimatePresence>` + slide between routes. Mobile-app cosplay.
  We're a web dApp; routes change instantly.
- ❌ Auto-stagger 0.1s on every list. Use stagger only when the list
  serves a beat (round-by-round reveal, verdict-aftermath stat tally).
- ❌ Spring physics on text. Looks unstable. Use ease curves.
- ❌ Bouncy easing on serious actions (signing tx, staking). Those
  should feel deliberate.
- ❌ Idle pulses on non-interactive elements.
- ❌ Constant rotation/sine-wave on logos or icons. Lottie-spinner energy.

## Earned overshoot principle

Overshoot signals impact or completion. Idle states never overshoot.

- ✅ Verdict reveal — the fight is over, the winner *lands*.
- ✅ Reaction count slam — user just *acted*, give the action weight.
- ✅ Mint complete — the fighter just *became real*.
- ❌ Modal opening — that's navigation, not impact.
- ❌ Page entry — there's no event being celebrated.

## Composition rules

- One motion per beat. If you're tempted to chain three animations on
  the same element for one event, you're decorating, not narrating.
- `layout` prop is powerful — use it for tab indicators and re-ordering
  lists, never for general "smooth movement" feel.
- Reduced-motion users: respect `prefers-reduced-motion: reduce`. Wrap
  combat-vocab variants in `useReducedMotion()` checks; fall back to
  instant state changes (no opacity/scale entry, no breathing).

## Apply in this order

1. Combat-layer pilots first (battle live arena — speech breathing,
   reaction slam, round transition).
2. Mint reveal (combat overshoot at the moment the token id lands).
3. Marketplace card hover (CSS-only, kept off motion library).
4. Sign-off → scale to global components (toast slide-in, modal scale).

Until sign-off, do not motion-up other surfaces. Pilot then pattern.
