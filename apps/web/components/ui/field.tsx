import type { CSSProperties, ReactNode } from "react";

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

export function Field({ label, hint, error, required, children, style }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--tx-secondary)" }}>
            {label}
            {required && <span style={{ color: "var(--accent)", marginLeft: 4 }}>*</span>}
          </span>
          {hint && !error && (
            <span style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>{hint}</span>
          )}
        </label>
      )}
      {children}
      {error && <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
