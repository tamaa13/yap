import type { CSSProperties, ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
  style?: CSSProperties;
}

export function StatCard({ label, value, sub, mono = true, style }: StatCardProps) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--bg-surface)",
        border: "1px solid var(--bd-default)",
        borderRadius: 6,
        ...style,
      }}
    >
      <div className="label" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? "var(--mono)" : "inherit",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--tx-primary)",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--tx-tertiary)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}
