"use client";

import {
  forwardRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string;
}

/**
 * Promoter textarea — square corners, ink-900 ground, 1.5px border
 * thickening to crimson on focus. Mono by default — Yap textareas
 * carry style-seed JSONL more often than prose.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { error, rows = 4, style, onFocus, onBlur, ...rest },
    ref,
  ) {
    const [focus, setFocus] = useState(false);
    const borderColor = error
      ? "var(--yap-danger)"
      : focus
        ? "var(--yap-crimson)"
        : "var(--yap-ink-600)";
    return (
      <textarea
        ref={ref}
        rows={rows}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={{
          width: "100%",
          padding: "11px 14px",
          resize: "vertical",
          background: "var(--yap-ink-900)",
          color: "var(--yap-ink-50)",
          border: `1.5px solid ${borderColor}`,
          borderRadius: 0,
          fontSize: 14,
          lineHeight: 1.55,
          fontFamily: "var(--yap-font-mono)",
          outline: "none",
          transition: "border-color 150ms cubic-bezier(.32,.72,0,1)",
          ...style,
        }}
        {...rest}
      />
    );
  },
);
