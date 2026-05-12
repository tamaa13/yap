import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  cta?: ReactNode;
  icon?: IconName;
}

/**
 * Promoter empty state — dashed ink-500 border on ink-800 ground, big
 * dashed glyph well, Anton display title, mono body, opt-in CTA.
 * Per STYLE.md voice: opinionated copy + clear CTA, never "no items
 * found".
 */
export function EmptyState({
  title,
  body,
  cta,
  icon = "alert",
}: EmptyStateProps) {
  return (
    <div
      style={{
        background: "var(--yap-ink-800)",
        border: "1px dashed var(--yap-ink-500)",
        padding: "48px 32px",
        textAlign: "center",
        color: "var(--yap-ink-300)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          border: "2px dashed var(--yap-ink-500)",
          display: "grid",
          placeItems: "center",
          color: "var(--yap-ink-400)",
        }}
      >
        <Icon name={icon} size={28} />
      </div>
      <div
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 800,
          fontSize: 28,
          lineHeight: 1,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--yap-ink-50)",
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontSize: 13,
            color: "var(--yap-ink-300)",
            lineHeight: 1.55,
            maxWidth: 380,
          }}
        >
          {body}
        </div>
      )}
      {cta}
    </div>
  );
}
