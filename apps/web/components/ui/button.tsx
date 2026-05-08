"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "gold";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

// Map React variants to .btn-family CSS classes (defined in globals.css
// under the BUTTONS section). Geometry, palette, hover translate, and
// reduced-motion guard all live in CSS — the component composes class
// names so the press feel is identical wherever .btn is used (including
// any non-React surface that opts in).
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "", // crimson default — no extra class
  secondary: "btn--secondary",
  ghost: "btn--ghost",
  destructive: "btn--danger",
  gold: "btn--gold",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn--sm",
  md: "", // base
  lg: "btn--lg",
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
    className,
    style,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  const cls = [
    "btn",
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? "btn--full" : "",
    isDisabled ? "is-disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Inline overrides only — caller-supplied `style` still wins for
  // edge cases (positioning, custom widths). Loading uses the existing
  // skeleton block so the press dimensions don't shift between idle
  // and loading states.
  const inlineStyle: CSSProperties = {
    ...style,
  };

  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={isDisabled}
      className={cls}
      style={inlineStyle}
      {...rest}
    >
      {loading ? (
        <span
          className="al-skel"
          style={{ width: 12, height: 12, borderRadius: 0 }}
        />
      ) : (
        leading
      )}
      {children}
      {trailing}
    </button>
  );
});
