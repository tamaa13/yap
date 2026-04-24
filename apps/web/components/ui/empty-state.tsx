import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  cta?: ReactNode;
  icon?: IconName;
}

export function EmptyState({ title, body, cta, icon = "alert" }: EmptyStateProps) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--tx-secondary)" }}>
      <Icon
        name={icon}
        size={28}
        style={{ color: "var(--tx-tertiary)", margin: "0 auto 12px", display: "block" }}
      />
      <div style={{ fontSize: 15, color: "var(--tx-primary)", fontWeight: 500, marginBottom: 6 }}>
        {title}
      </div>
      {body && <div style={{ fontSize: 13, maxWidth: 360, margin: "0 auto 16px" }}>{body}</div>}
      {cta}
    </div>
  );
}
