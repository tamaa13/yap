"use client";

import { useEffect, useState, type CSSProperties, type InputHTMLAttributes } from "react";

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | string;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  containerStyle?: CSSProperties;
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  suffix,
  containerStyle,
  ...rest
}: NumberInputProps) {
  const [focus, setFocus] = useState(false);
  // Local string buffer so users can type intermediate states like "", "0.",
  // or ".5" without the controlled component forcing them back to a number.
  // Synced to the parent numeric value only when the buffer is a valid number.
  const [buf, setBuf] = useState<string>(String(value));
  useEffect(() => {
    // Keep buffer in sync when the parent sets a new value AND we're not
    // currently editing — don't clobber user input mid-type.
    if (!focus) setBuf(String(value));
  }, [value, focus]);

  const adjust = (d: number) => {
    const n = Number(value) || 0;
    const next = Math.max(min, Math.min(max, +(n + d * step).toFixed(6)));
    onChange?.(next);
  };

  const handleChange = (raw: string) => {
    // Accept "", "0.", "0.5", ".5", etc. while typing.
    setBuf(raw);
    if (raw === "" || raw === ".") {
      // Defer — not yet a valid number. Do NOT reset parent.
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      onChange?.(n);
    }
  };

  const handleBlur = () => {
    setFocus(false);
    const n = Number(buf);
    if (!Number.isFinite(n)) {
      // Fall back to current value on blur if user left garbage.
      setBuf(String(value));
      return;
    }
    // Clamp on blur only, so mid-edit states aren't forced.
    const clamped = Math.max(min, Math.min(max, n));
    if (clamped !== n) {
      onChange?.(clamped);
      setBuf(String(clamped));
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        height: 34,
        flex: 1,
        minWidth: 0,
        background: "var(--bg-sunken)",
        border: `1px solid ${focus ? "var(--accent)" : "var(--bd-default)"}`,
        borderRadius: 4,
        transition: "border-color 150ms ease-out",
        ...containerStyle,
      }}
    >
      <button
        type="button"
        onClick={() => adjust(-1)}
        style={{
          width: 30,
          borderRight: "1px solid var(--bd-subtle)",
          color: "var(--tx-secondary)",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={buf}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={handleBlur}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--tx-primary)",
          fontSize: 13,
          fontFamily: "var(--mono)",
          textAlign: "center",
          padding: "0 6px",
        }}
        {...rest}
      />
      {suffix && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--tx-tertiary)",
            borderLeft: "1px solid var(--bd-subtle)",
          }}
        >
          {suffix}
        </span>
      )}
      <button
        type="button"
        onClick={() => adjust(1)}
        style={{
          width: 30,
          borderLeft: "1px solid var(--bd-subtle)",
          color: "var(--tx-secondary)",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        +
      </button>
    </div>
  );
}
