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
          height: 34,
          padding: "0 32px 0 10px",
          background: "var(--bg-sunken)",
          color: "var(--tx-primary)",
          border: `1px solid ${focus ? "var(--accent)" : "var(--bd-default)"}`,
          borderRadius: 4,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          cursor: "pointer",
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={14}
        style={{ position: "absolute", right: 10, pointerEvents: "none", color: "var(--tx-tertiary)" }}
      />
    </div>
  );
});
