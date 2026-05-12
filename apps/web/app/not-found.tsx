import Link from "next/link";
import { TopNav } from "@/components/shell/top-nav";

/**
 * Custom 404 — App Router convention. Catches any unmatched route
 * globally. Renders the top nav (consistent chrome) then the 404
 * body directly on the red page bg — no Card wrapper, no EmptyState
 * primitive, matches the EntryGate / GateScreen "content centered
 * on red" pattern from v6.
 *
 * Font split (v22): the "404" hero number renders in **Poesing**
 * (grunge digits = poster mystique) while the rest of the page
 * surface (subhead, body, CTAs) renders in **Riot** (clean stencil
 * matches the rest of the site's hero-tier vocabulary). Explicit
 * inline overrides on every text element so the split holds
 * regardless of cascade tweaks elsewhere.
 *
 * Voice: sport vocabulary, no AI-app boilerplate. The match isn't
 * on tonight's program — back to the ring or browse arenas.
 */
export default function NotFound() {
  return (
    <>
      <TopNav />
      <main
        style={{
          minHeight: "calc(100vh - 52px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          padding: "80px 32px",
          textAlign: "center",
        }}
      >
        {/* 404 hero — POESING (only Poesing callsite on this page) */}
        <div
          style={{
            fontFamily: "var(--yap-font-display-2)",
            fontWeight: 400,
            fontSize: "clamp(120px, 18vw, 240px)",
            lineHeight: 0.82,
            letterSpacing: "-2px",
            textTransform: "uppercase",
            color: "var(--yap-ink-0)",
            textShadow: "6px 6px 0 var(--yap-ink-900)",
          }}
        >
          404
        </div>

        {/* Subhead — Riot */}
        <div
          style={{
            fontFamily: "var(--yap-font-display)",
            fontWeight: 400,
            fontSize: "clamp(30px, 4.5vw, 50px)",
            color: "var(--yap-ink-0)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            lineHeight: 1,
          }}
        >
          Off the card
        </div>

        {/* Body — Riot. Uppercase + tracking since Riot is a stencil
         * face that doesn't sit well in mixed-case body text. */}
        <p
          style={{
            fontFamily: "var(--yap-font-display)",
            maxWidth: "32ch",
            color: "rgba(255,255,255,0.85)",
            fontSize: 16,
            lineHeight: 1.4,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          This match isn&apos;t on tonight&apos;s program.
        </p>

        {/* CTAs — Riot. Inline override on each Link so it beats
         * the `.btn` Poesing default from v18. */}
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            href="/"
            className="btn"
            style={{ fontFamily: "var(--yap-font-display)" }}
          >
            ← Back to the ring
          </Link>
          <Link
            href="/arenas"
            className="btn btn--ghost"
            style={{ fontFamily: "var(--yap-font-display)" }}
          >
            Browse arenas →
          </Link>
        </div>
      </main>
    </>
  );
}
