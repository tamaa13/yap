// Design tokens as TS constants.
// Mirrors the CSS variables in app/globals.css (Promoter direction).
// Prefer the CSS var form (--yap-* or legacy --bg-/--tx-/--accent
// aliases) in component styles. This module is a JS-side fallback for
// consumers that need raw hex (RainbowKit theme, SVG attributes,
// canvas / image generation routes).

export const tokens = {
  bg: {
    canvas: "#0E0B08", // yap-ink-950
    surface: "#1A1612", // yap-ink-800
    raised: "#221C16", // yap-ink-700
    sunken: "#14110E", // yap-ink-900
  },
  border: {
    subtle: "#221C16", // yap-ink-700
    default: "#2C251D", // yap-ink-600
    strong: "#443A2E", // yap-ink-500
    focus: "#C8102E", // yap-crimson
  },
  text: {
    primary: "#F2EDE2", // yap-ink-50 (cream)
    secondary: "#B8B0A2", // yap-ink-200
    tertiary: "#8A8378", // yap-ink-300
    disabled: "#443A2E", // yap-ink-500
    inverted: "#0E0B08", // yap-ink-950 (for fills on cream/gold/crimson)
  },
  accent: {
    default: "#C8102E", // yap-crimson
    soft: "#A60D26", // yap-crimson-soft
    deep: "#7A0918", // yap-crimson-deep
    muted: "rgba(200,16,46,0.12)",
    border: "rgba(200,16,46,0.40)",
    gold: "#C9A961", // yap-gold (for tape/promo callouts)
    bruise: "#5C2530", // yap-bruise
  },
  // Corner colors — Promoter mapping per main 2026-05-08:
  // crimson for A (challenger), gold for B (defender).
  fighter: {
    a: "#C8102E",
    b: "#C9A961",
    aBg: "rgba(200,16,46,0.08)",
    bBg: "rgba(201,169,97,0.08)",
    aBd: "rgba(200,16,46,0.28)",
    bBd: "rgba(201,169,97,0.28)",
  },
  state: {
    success: "#5BA855",
    warning: "#E8A22B",
    danger: "#E0432B",
    info: "#5DA0D6",
    live: "#E0432B",
  },
  data: ["#C8102E", "#C9A961", "#5BA855", "#5DA0D6", "#E8A22B"] as const,
  radius: { none: 0, sm: 2, md: 4, lg: 8, full: 999 },
  shadow: {
    sm: "0 1px 0 rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.25)",
    md: "0 2px 0 rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.35)",
    lg: "0 4px 0 rgba(0,0,0,.55), 0 16px 48px rgba(0,0,0,.5)",
  },
} as const;

export type Tokens = typeof tokens;
