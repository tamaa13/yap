export interface YapMarkProps {
  /** Display height. Letter weight scales with size. */
  size?: number;
  /** Mark color. Defaults to vermillion. */
  color?: string;
  /** Optional left-side bullet dot — set to false to drop. */
  dot?: boolean;
}

/**
 * Yap wordmark — pure typographic mark, no icon.
 *
 * The brand is the type, set in heavy Saira Condensed tracked tight
 * with a vermillion bullet leading the letter group. A wordmark-only
 * mark reads as senior + restrained; an icon would add noise without
 * carrying any combat-sport meaning.
 *
 * Caller passes `size` in px (height); the type renders ~1.4× that
 * width so it can sit in topbars / footers as a horizontal element.
 */
export function YapMark({
  size = 22,
  color = "#E69500",
  dot = true,
}: YapMarkProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.max(6, size * 0.35),
        height: size,
        fontFamily: "var(--yap-font-display)",
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.04em",
        textTransform: "uppercase",
        color: "currentColor",
        userSelect: "none",
      }}
    >
      {dot ? (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: Math.max(8, size * 0.32),
            height: Math.max(8, size * 0.32),
            background: color,
            flexShrink: 0,
          }}
        />
      ) : null}
      Yap
    </span>
  );
}
