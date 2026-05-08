"use client";

import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const sizes: Record<ButtonSize, CSSProperties> = {
  sm: { height: 28, padding: "0 10px", fontSize: 12 },
  md: { height: 34, padding: "0 14px", fontSize: 13 },
  lg: { height: 42, padding: "0 20px", fontSize: 14 },
};

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--accent)", color: "var(--yap-ink-50)", borderColor: "var(--accent)" },
  secondary: { background: "transparent", color: "var(--tx-primary)", borderColor: "var(--bd-strong)" },
  ghost: { background: "transparent", color: "var(--tx-secondary)", borderColor: "transparent" },
  destructive: { background: "transparent", color: "var(--danger)", borderColor: "rgba(232,107,107,0.40)" },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    children,
    leading,
    trailing,
    loading,
    disabled,
    fullWidth,
    style,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState(false);
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontFamily: "inherit",
    fontWeight: 500,
    letterSpacing: 0,
    borderRadius: 4,
    border: "1px solid transparent",
    cursor: "pointer",
    transition: "background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out",
    whiteSpace: "nowrap",
    userSelect: "none",
    width: fullWidth ? "100%" : undefined,
  };

  const isDisabled = disabled || loading;
  const disabledStyle: CSSProperties = isDisabled
    ? { opacity: 0.4, cursor: "not-allowed", pointerEvents: "none" }
    : {};

  const hoverStyle: CSSProperties =
    hover && !isDisabled
      ? variant === "primary"
        ? { background: "var(--accent-hover)" }
        : variant === "secondary"
          ? { background: "rgba(255,255,255,0.04)" }
          : variant === "ghost"
            ? { background: "rgba(255,255,255,0.04)", color: "var(--tx-primary)" }
            : variant === "destructive"
              ? { background: "rgba(232,107,107,0.08)" }
              : {}
      : {};

  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={isDisabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        ...hoverStyle,
        ...disabledStyle,
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <span className="al-skel" style={{ width: 12, height: 12, borderRadius: 2 }} />
      ) : (
        leading
      )}
      {children}
      {trailing}
    </button>
  );
});
