import type { CSSProperties } from "react";

export interface StepHeaderProps {
  steps: string[];
  current: number;
  withNumber?: boolean;
  style?: CSSProperties;
}

export function StepHeader({ steps, current, withNumber = false, style }: StepHeaderProps) {
  return (
    <div style={{ display: "flex", gap: 8, ...style }}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const reached = current >= idx;
        const active = current === idx;
        return (
          <div
            key={label}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: reached ? "var(--bg-surface)" : "var(--bg-sunken)",
              border: `1px solid ${active ? "var(--accent-border)" : "var(--bd-default)"}`,
              borderRadius: 4,
              fontSize: 12,
              color: reached ? "var(--tx-primary)" : "var(--tx-tertiary)",
            }}
          >
            {withNumber && (
              <span
                className="mono"
                style={{
                  color: reached ? "var(--accent)" : "var(--tx-tertiary)",
                  marginRight: 8,
                }}
              >
                {String(idx).padStart(2, "0")}
              </span>
            )}
            {label}
          </div>
        );
      })}
    </div>
  );
}
