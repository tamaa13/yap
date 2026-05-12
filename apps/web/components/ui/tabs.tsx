"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

export interface Tab<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

export interface TabsProps<T extends string = string> {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: CSSProperties;
}

/**
 * Promoter underline tabs — Anton display labels, mono caption count,
 * 3px crimson underline on active. Underline animates between tabs
 * via motion `layoutId` (navigation vocab — fast, dampened).
 */
export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  style,
}: TabsProps<T>) {
  const reduced = useReducedMotion();
  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        borderBottom: "1px solid var(--yap-ink-600)",
        ...style,
      }}
    >
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            style={{
              padding: "12px 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              position: "relative",
              fontFamily: "var(--yap-font-display-2)",
              fontWeight: 400,
              fontSize: 20,
              lineHeight: 1,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: active ? "var(--yap-ink-50)" : "var(--yap-ink-300)",
              marginBottom: -1,
              transition: "color 150ms cubic-bezier(.32,.72,0,1)",
              display: "inline-flex",
              alignItems: "baseline",
              gap: 6,
            }}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: active ? "var(--yap-gold)" : "var(--yap-ink-500)",
                  letterSpacing: 1,
                }}
              >
                {t.count}
              </span>
            )}
            {active && (
              reduced ? (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 3,
                    background: "var(--yap-crimson)",
                  }}
                />
              ) : (
                <motion.span
                  layoutId="yap-tab-underline"
                  transition={{
                    duration: 0.18,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 3,
                    background: "var(--yap-crimson)",
                  }}
                />
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
