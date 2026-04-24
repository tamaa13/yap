import type { CSSProperties, ReactNode } from "react";

export type BadgeTone = "default" | "accent" | "success" | "warning" | "danger" | "a" | "b";

const tones: Record<BadgeTone, CSSProperties> = {
  default: { color: "var(--tx-secondary)", borderColor: "var(--bd-default)" },
  accent: { color: "var(--accent)", borderColor: "var(--accent-border)" },
  success: { color: "var(--success)", borderColor: "rgba(107,203,119,0.30)" },
  warning: { color: "var(--warning)", borderColor: "rgba(232,169,107,0.30)" },
  danger: { color: "var(--danger)", borderColor: "rgba(232,107,107,0.30)" },
  a: { color: "var(--fighter-a)", borderColor: "rgba(107,154,232,0.30)" },
  b: { color: "var(--fighter-b)", borderColor: "rgba(232,154,107,0.30)" },
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  mono?: boolean;
  style?: CSSProperties;
}

export function Badge({ children, tone = "default", mono = false, style }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 20,
        padding: "0 6px",
        fontFamily: mono ? "var(--mono)" : "inherit",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: mono ? 0.08 : 0,
        textTransform: mono ? "uppercase" : "none",
        borderRadius: 2,
        border: "1px solid",
        background: "transparent",
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
