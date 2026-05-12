import Link from "next/link";
import { TopNav } from "@/components/shell/top-nav";

/**
 * Custom 404 — App Router convention. Catches any unmatched route
 * globally. Renders the top nav (consistent chrome) then the 404
 * body directly on the red page bg — no Card wrapper, no EmptyState
 * primitive, matches the EntryGate / GateScreen "content centered
 * on red" pattern from v6.
 *
 * Font exception: 404 surface renders **entirely in Riot** per
 * Tama. Overrides the locked Poesing-default for body / subhead /
 * `.btn` cascade on this single page. Sport vocabulary kept; the
 * match isn't on tonight's program — back to the ring or browse
 * arenas.
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
        {/* 404 hero — Riot display, hard ink offset for poster pop */}
        <div
          style={{
            fontFamily: "var(--yap-font-display)",
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

        {/* Subhead — Riot, sized down ~12% from prior Poesing 56 max
         * since Riot reads heavier optical weight at the same px. */}
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

        {/* Body — explicit Riot override, sized down from 18 → 16 */}
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

        {/* CTAs — primary amber .btn + ghost outline. Inline
         * fontFamily override on each Link so the Riot exception
         * also extends to the buttons on this page. */}
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
