"use client";

import {
  forwardRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
  error?: boolean | string;
  containerStyle?: CSSProperties;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, error, style, containerStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const [focus, setFocus] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        flex: 1,
        minWidth: 0,
        padding: "0 10px",
        background: "var(--bg-sunken)",
        border: `1px solid ${error ? "rgba(232,107,107,0.60)" : focus ? "var(--accent)" : "var(--bd-default)"}`,
        borderRadius: 4,
        transition: "border-color 150ms ease-out",
        ...containerStyle,
      }}
    >
      {leading && <span style={{ color: "var(--tx-tertiary)", display: "flex" }}>{leading}</span>}
      <input
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
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--tx-primary)",
          fontSize: 13,
          minWidth: 0,
          ...style,
        }}
        {...rest}
      />
      {trailing && <span style={{ color: "var(--tx-tertiary)", display: "flex" }}>{trailing}</span>}
    </div>
  );
});
