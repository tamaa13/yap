import Link from "next/link";
import { TopNav } from "@/components/shell/top-nav";

/**
 * Custom 404 — App Router convention. Catches any unmatched route
 * globally. Renders the top nav (consistent chrome) then the 404
 * body directly on the red page bg — no Card wrapper, no EmptyState
 * primitive, matches the EntryGate / GateScreen "content centered
 * on red" pattern from v6.
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

        {/* Subhead — Poesing, sport vocab */}
        <div
          style={{
            fontFamily: "var(--yap-font-display-2)",
            fontWeight: 400,
            fontSize: "clamp(34px, 5vw, 56px)",
            color: "var(--yap-ink-0)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            lineHeight: 1,
          }}
        >
          Off the card
        </div>

        {/* Body — body cascade renders Poesing */}
        <p
          style={{
            maxWidth: "44ch",
            color: "rgba(255,255,255,0.85)",
            fontSize: 18,
            lineHeight: 1.45,
            letterSpacing: 0.2,
            margin: 0,
          }}
        >
          This match isn&apos;t on tonight&apos;s program.
        </p>

        {/* CTAs — primary amber .btn + ghost outline. Matches site
         * button vocabulary across landing / connect / gate-screen. */}
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link href="/" className="btn">
            ← Back to the ring
          </Link>
          <Link href="/arenas" className="btn btn--ghost">
            Browse arenas →
          </Link>
        </div>
      </main>
    </>
  );
}
