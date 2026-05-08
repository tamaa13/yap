"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Card({ children, style, interactive = false, onClick, className }: CardProps) {
  // Hover state stays JS-driven for non-interactive cards that may
  // still want a subtle border-color shift. Interactive cards lean on
  // the global `al-card-lift` class — CSS owns the lift+tilt+shadow
  // hover micro-state per MOTION.md (combat micro-state, not motion-lib
  // sequence).
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      className={["al-card", interactive && "al-card-lift", className]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={() => !interactive && setHover(true)}
      onMouseLeave={() => !interactive && setHover(false)}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${hover ? "var(--bd-strong)" : "var(--bd-default)"}`,
        borderRadius: 6,
        cursor: interactive ? "pointer" : "default",
        transition: "background 150ms ease-out",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
