"use client";

import {
  forwardRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error, rows = 4, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focus, setFocus] = useState(false);
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
        padding: "10px 12px",
        resize: "vertical",
        background: "var(--bg-sunken)",
        color: "var(--tx-primary)",
        border: `1px solid ${error ? "rgba(232,107,107,0.60)" : focus ? "var(--accent)" : "var(--bd-default)"}`,
        borderRadius: 4,
        fontSize: 13,
        lineHeight: 1.5,
        fontFamily: "inherit",
        outline: "none",
        transition: "border-color 150ms ease-out",
        ...style,
      }}
      {...rest}
    />
  );
});
