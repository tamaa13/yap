"use client";

import type { CSSProperties } from "react";
import { Icon } from "./icon";
import { useToast } from "./toast";

export interface HashProps {
  value: string;
  copy?: boolean;
  style?: CSSProperties;
}

export function Hash({ value, copy = false, style }: HashProps) {
  const { push } = useToast();
  const short = value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--mono)",
        fontSize: 12,
        color: "var(--tx-secondary)",
        ...style,
      }}
    >
      {short}
      {copy && (
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value);
            push({ text: "Copied." });
          }}
          style={{ color: "var(--tx-tertiary)", display: "inline-flex" }}
        >
          <Icon name="copy" size={12} />
        </button>
      )}
    </span>
  );
}
