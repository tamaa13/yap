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

/**
 * Promoter input chrome — square corners, ink-900 ground, ink-600
 * border thickening to 1.5px on focus → crimson. Mono numerics by
 * default; archive (body) for prose via the trailing slot.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, error, style, containerStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const [focus, setFocus] = useState(false);
  const borderColor = error
    ? "var(--yap-danger)"
    : focus
      ? "var(--yap-crimson)"
      : "var(--yap-ink-600)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 38,
        flex: 1,
        minWidth: 0,
        padding: "0 12px",
        background: "var(--yap-ink-900)",
        border: `1.5px solid ${borderColor}`,
        borderRadius: 0,
        transition: "border-color 150ms cubic-bezier(.32,.72,0,1)",
        ...containerStyle,
      }}
    >
      {leading && (
        <span style={{ color: "var(--yap-ink-300)", display: "flex" }}>
          {leading}
        </span>
      )}
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
          color: "var(--yap-ink-50)",
          fontFamily: "var(--yap-font-mono)",
          fontSize: 14,
          minWidth: 0,
          ...style,
        }}
        {...rest}
      />
      {trailing && (
        <span style={{ color: "var(--yap-ink-300)", display: "flex" }}>
          {trailing}
        </span>
      )}
    </div>
  );
});
