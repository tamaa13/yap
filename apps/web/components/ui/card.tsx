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
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      className={["al-card", className].filter(Boolean).join(" ")}
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${hover ? "var(--bd-strong)" : "var(--bd-default)"}`,
        borderRadius: 6,
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 150ms ease-out, background 150ms ease-out",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
