"use client";

import type { CSSProperties } from "react";

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

export function Tabs<T extends string = string>({ tabs, value, onChange, style }: TabsProps<T>) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--bd-default)",
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
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: active ? "var(--tx-primary)" : "var(--tx-secondary)",
              borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
              marginBottom: -1,
              transition: "color 150ms ease-out",
            }}
          >
            {t.label}
            {t.count != null && (
              <span
                style={{
                  marginLeft: 6,
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--tx-tertiary)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
