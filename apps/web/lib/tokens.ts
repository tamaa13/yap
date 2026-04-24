// Design tokens as TS constants.
// Mirrors the CSS variables in app/globals.css. Prefer the CSS var form in component styles.

export const tokens = {
  bg: {
    canvas: "#0A0B0F",
    surface: "#12131A",
    raised: "#1A1B23",
    sunken: "#06070A",
  },
  border: {
    subtle: "rgba(255,255,255,0.06)",
    default: "rgba(255,255,255,0.10)",
    strong: "rgba(255,255,255,0.18)",
    focus: "#FFB800",
  },
  text: {
    primary: "#E8E9ED",
    secondary: "#A0A2AB",
    tertiary: "#6B6D76",
    disabled: "#3F4048",
    inverted: "#0A0B0F",
  },
  accent: {
    default: "#FFB800",
    hover: "#FFC933",
    muted: "rgba(255,184,0,0.12)",
    border: "rgba(255,184,0,0.40)",
  },
  fighter: {
    a: "#6B9AE8",
    b: "#E89A6B",
    aBg: "rgba(107,154,232,0.08)",
    bBg: "rgba(232,154,107,0.08)",
    aBd: "rgba(107,154,232,0.28)",
    bBd: "rgba(232,154,107,0.28)",
  },
  state: {
    success: "#6BCB77",
    warning: "#E8A96B",
    danger: "#E86B6B",
    info: "#6B9AE8",
    live: "#E86B6B",
  },
  data: ["#6B9AE8", "#E89A6B", "#6BCB77", "#A48FE8", "#E8A96B"] as const,
  radius: { none: 0, sm: 2, md: 4, lg: 6, xl: 8, full: 9999 },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.4)",
    md: "0 4px 12px rgba(0,0,0,0.5)",
    lg: "0 12px 32px rgba(0,0,0,0.6)",
  },
} as const;

export type Tokens = typeof tokens;
