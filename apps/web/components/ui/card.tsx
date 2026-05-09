"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  /** Bumps the surface to the elevated ink-700 + sh-2 drop shadow.
   *  Use sparingly — only the headline card per surface should elevate. */
  elevated?: boolean;
  /** Adds the `.al-card-lift` class — CSS owns the hover (translateY
   *  -2px, crimson border, shadow expand) + active (collapse) feel.
   *  Per MOTION.md hover micro-state. */
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Promoter card chrome — square corners, ink-800 ground (or ink-700
 * elevated), ink-600 border. Geometry + hover live in CSS so any
 * surface (e.g. third-party widgets) can opt into `.al-card`.
 *
 * Caller still controls padding via the `style` prop (codebase
 * convention — varies per density). For Promoter section composition
 * use the `.card-head` / `.card-title` / `.card-foot` / `.role-tag`
 * descendant classes (CSS in globals.css).
 */
export function Card({
  children,
  style,
  elevated = false,
  interactive = false,
  onClick,
  className,
}: CardProps) {
  const [hover, setHover] = useState(false);
  const cls = [
    "al-card",
    elevated ? "elevated" : "",
    interactive ? "al-card-lift" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      onClick={onClick}
      className={cls}
      onMouseEnter={() => !interactive && setHover(true)}
      onMouseLeave={() => !interactive && setHover(false)}
      style={{
        cursor: interactive ? "pointer" : "default",
        // JS-driven border tint for non-interactive cards (subtle hover
        // signal on cards with onClick that aren't full-lift); CSS-class
        // hover wins for interactive.
        ...(hover && !interactive
          ? { borderColor: "var(--yap-ink-500)" }
          : null),
        transition: "border-color 150ms ease-out",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
