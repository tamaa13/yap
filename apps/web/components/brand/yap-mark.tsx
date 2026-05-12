export interface YapMarkProps {
  /** Display height of the "Yap" letterforms (the plate hugs them
   *  with internal padding). */
  size?: number;
  /** Plate fill — defaults to true near-black so the stamp pops
   *  on the saturated-crimson page. */
  plate?: string;
  /** Wordmark fill — defaults to cream. */
  ink?: string;
}

/**
 * Yap mark — black plate + cream Riot wordmark "YAP", fight-poster
 * seal aesthetic. Replaces the prior free-floating wordmark which
 * read patchy on the red page (Riot's stencil character lets ground
 * bleed through). A solid plate guarantees contrast regardless of
 * the underlying surface.
 *
 * Cut-corner geometry via clip-path (`--yap-cut-sm`) matches the
 * `.btn` button corner shape — the mark + buttons share one
 * vocabulary.
 */
export function YapMark({
  size = 22,
  plate = "#0A0A0A",
  ink = "#F4ECDB",
}: YapMarkProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: plate,
        padding: `${Math.round(size * 0.30)}px ${Math.round(size * 0.45)}px ${Math.round(size * 0.22)}px`,
        clipPath: "var(--yap-cut-sm)",
        flexShrink: 0,
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 400,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          color: ink,
        }}
      >
        Yap
      </span>
    </span>
  );
}
