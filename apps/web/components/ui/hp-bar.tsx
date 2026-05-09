/**
 * Promoter HP / Logic / Wit bar — 20 discrete segments.
 * Source: docs/design/project/page-shared.jsx StatBars + design-system.html.
 *
 * Segmented (vs the prior smooth fill) so the bar reads as ammunition
 * counters / fight-card stats rather than a generic "loading bar".
 * Each segment lights when the value crosses its threshold; an unlit
 * segment is dim ink-700.
 *
 * Backward compat: continues to accept `value` (0-100), `max`,
 * `color`, `height`, `showText`, `label`. Old callers don't break.
 */
export interface HPBarProps {
  value: number;
  max?: number;
  /** Lit segment color — tone the bar to fighter corner. */
  color?: string;
  /** Bar height in px (renders as the segment height). */
  height?: number;
  /** Show "{value}/{max}" or padded "{value}" text alongside label. */
  showText?: boolean;
  /** Mono caps label rendered above the segments. */
  label?: string;
  /** Number of discrete segments. Default 20 — mirrors the page mock. */
  segments?: number;
}

export function HPBar({
  value,
  max = 100,
  color = "var(--yap-crimson)",
  height = 8,
  showText = false,
  label,
  segments = 20,
}: HPBarProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const lit = Math.round((clamped / max) * segments);
  const padded = String(Math.round(clamped))
    .padStart(String(max).length, "0");
  return (
    <div>
      {label && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: "var(--yap-ink-300)",
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
          {showText && (
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--yap-ink-200)",
              }}
            >
              {showText ? padded : `${value}/${max}`}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${segments}, 1fr)`,
          gap: 2,
          height,
        }}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            style={{
              background: i < lit ? color : "var(--yap-ink-700)",
              transition: "background 400ms ease-out",
            }}
          />
        ))}
      </div>
    </div>
  );
}
