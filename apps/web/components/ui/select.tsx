"use client";

import {
  forwardRef,
  useState,
  type SelectHTMLAttributes,
} from "react";
import { Icon } from "./icon";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
      <select
        ref={ref}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          width: "100%",
          height: 38,
          padding: "0 36px 0 12px",
          background: "var(--yap-ink-900)",
          color: "var(--yap-ink-50)",
          border: `1.5px solid ${focus ? "var(--yap-crimson)" : "var(--yap-ink-600)"}`,
          borderRadius: 0,
          fontSize: 14,
          fontFamily: "var(--yap-font-mono)",
          outline: "none",
          cursor: "pointer",
          transition: "border-color 150ms cubic-bezier(.32,.72,0,1)",
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={14}
        style={{
          position: "absolute",
          right: 12,
          pointerEvents: "none",
          color: "var(--yap-ink-300)",
        }}
      />
    </div>
  );
});
