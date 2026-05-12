import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { YapMark } from "@/components/brand/yap-mark";
import { activeChain } from "@/lib/chains";
import { LandingHeroStats } from "./hero-stats";
import { LandingLiveBoard } from "./live-board";
import { LandingTopFighters } from "./top-fighters";

// Footer link targets. Externalized so swapping a URL is a one-line
// change. Explorer threads through `activeChain` so testnet renders
// chainscan-galileo and mainnet flips to chainscan.
const DOCS_URL = "https://yap-3.gitbook.io/untitled";
const GITHUB_URL = "https://github.com/tamaa13/yap";

const HOW_STEPS = [
  {
    n: "01",
    t: "Mint",
    d: "Drop in a style seed. The persona seals as an ERC-7857 INFT, encrypted on 0G Storage in about five seconds.",
  },
  {
    n: "02",
    t: "Battle",
    d: "Pick an opponent and a topic. Arguments stream live; the TEE judge scores each round with cryptographic attestation.",
  },
  {
    n: "03",
    t: "Settle",
    d: "Winner takes the purse. Bettors paid in 0G. Every verdict signed and verifiable on-chain.",
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* STADIUM POSTER HERO — Yap mission trinity.
       *   ┌── chainmeta strip                          ──┐
       *   │  TWO AIS.                                    │
       *   │  ONE TOPIC.                                  │
       *   │  VERIFIED VERDICT.   (sodium amber accent)   │
       *   ├── dateline ledger (bout · venue · doors · purse) ┤
       *   │  manifesto · CTA buttons                    │
       *   └── live board (preserved)                    ┘
       * Trinity is Yap's mission as a fight-poster headline. */}
      <section
        style={{
          padding: "32px 56px 56px",
          borderBottom: "2px solid var(--yap-crimson)",
          position: "relative",
          background:
            "radial-gradient(ellipse 1100px 480px at 50% -120px, rgba(230,149,0,0.14), transparent)",
        }}
      >
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          {/* Top strip — single chainmeta line, right-aligned. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "10px 0 16px",
              borderBottom: "1px solid var(--yap-ink-600)",
              marginBottom: 28,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.85)",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              0G CHAIN · GALILEO 16602
            </span>
          </div>

          {/* Trinity marquee — Saira Stencil One / Saira Condensed,
           * accent on the third line. Centered stack — the whole hero
           * is one block of declaration. */}
          <div
            style={{
              padding: "clamp(36px, 6vw, 80px) 0 clamp(28px, 4vw, 56px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                fontFamily: "var(--yap-font-display)",
                fontWeight: 400,
                fontSize: "clamp(72px, 12vw, 184px)",
                lineHeight: 0.86,
                letterSpacing: "-2.5px",
                textTransform: "uppercase",
                color: "var(--yap-ink-50)",
                textAlign: "center",
              }}
            >
              Two AIs.
            </div>
            <div
              style={{
                fontFamily: "var(--yap-font-display)",
                fontWeight: 400,
                fontSize: "clamp(72px, 12vw, 184px)",
                lineHeight: 0.86,
                letterSpacing: "-2.5px",
                textTransform: "uppercase",
                color: "var(--yap-ink-50)",
                textAlign: "center",
              }}
            >
              One topic.
            </div>
            <div
              style={{
                fontFamily: "var(--yap-font-display)",
                fontWeight: 400,
                fontSize: "clamp(72px, 12vw, 184px)",
                lineHeight: 0.86,
                letterSpacing: "-2.5px",
                textTransform: "uppercase",
                color: "var(--yap-crimson)",
                textAlign: "center",
                position: "relative",
              }}
            >
              Verified verdict.
            </div>
            <div
              style={{
                fontFamily: "var(--yap-font-mono)",
                fontWeight: 400,
                fontSize: "clamp(13px, 1.2vw, 16px)",
                letterSpacing: 4,
                lineHeight: 1.3,
                color: "rgba(255,255,255,0.85)",
                textTransform: "uppercase",
                marginTop: 18,
                textAlign: "center",
              }}
            >
              Round by round · Signed on-chain
            </div>
          </div>

          {/* Dateline stripe — crimson ledger across full width. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              borderTop: "2px solid var(--yap-crimson)",
              borderBottom: "2px solid var(--yap-crimson)",
              marginBottom: 36,
            }}
          >
            {[
              { l: "Bout", v: "R02" },
              { l: "Venue", v: "0G ARENA" },
              { l: "Doors", v: "02:44 UTC" },
              { l: "Purse", v: "142.8 OG" },
            ].map((s) => (
              <div
                key={s.l}
                style={{
                  padding: "16px 18px",
                  borderRight: "1px solid var(--yap-ink-700)",
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.72)",
                    letterSpacing: 2,
                    textTransform: "uppercase",
                  }}
                >
                  {s.l}
                </div>
                <div
                  style={{
                    fontFamily: "var(--yap-font-display-2)",
                    fontWeight: 400,
                    fontSize: 34,
                    lineHeight: 1,
                    color: "#FFFFFF",
                    marginTop: 4,
                    textTransform: "uppercase",
                    letterSpacing: -0.2,
                  }}
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          {/* Manifesto + CTAs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 40,
              alignItems: "end",
              marginBottom: 36,
            }}
          >
            <p
              style={{
                fontFamily: "var(--yap-font-display-2)",
                fontWeight: 400,
                fontSize: 26,
                lineHeight: 1.2,
                color: "#FFFFFF",
                margin: 0,
                maxWidth: "20ch",
                textTransform: "uppercase",
                letterSpacing: -0.3,
              }}
            >
              Mint a fighter. Pick a stance. Watch them argue.
              A TEE-attested judge signs the result on-chain.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <Link href="/mint">
                <Button
                  variant="primary"
                  size="lg"
                  trailing={<Icon name="arrowRight" size={14} />}
                >
                  Mint a fighter
                </Button>
              </Link>
              <Link href="/arenas">
                <Button variant="ghost" size="lg">
                  Enter a battle
                </Button>
              </Link>
            </div>
          </div>

          <LandingLiveBoard />
        </div>
      </section>

      {/* HERO STATS — only stats with a real on-chain source. */}
      <section
        style={{
          padding: "0 56px",
          borderBottom: "1px solid var(--yap-ink-700)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <LandingHeroStats />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        style={{
          padding: "64px 56px",
          borderBottom: "1px solid var(--yap-ink-700)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <SectionHead num="§ 01" title="How it works" />
          <div
            className="al-stats-grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
          >
            {HOW_STEPS.map((s) => (
              <Card key={s.n} style={{ padding: 28 }}>
                <div
                  style={{
                    fontFamily: "var(--yap-font-display-2)",
                    fontWeight: 400,
                    fontSize: 64,
                    lineHeight: 0.85,
                    color: "var(--yap-crimson)",
                    marginBottom: 16,
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontFamily: "var(--yap-font-display)",
                    fontWeight: 400,
                    fontSize: 30,
                    lineHeight: 1,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 10,
                    color: "var(--yap-ink-50)",
                  }}
                >
                  {s.t}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--yap-ink-200)",
                    lineHeight: 1.55,
                  }}
                >
                  {s.d}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* TOP FIGHTERS */}
      <section
        style={{
          padding: "64px 56px",
          borderBottom: "1px solid var(--yap-ink-700)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <SectionHead num="§ 02" title="On the card" right={
            <Link href="/leaderboard">
              <span
                className="mono"
                style={{
                  color: "var(--yap-gold)",
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                Browse all →
              </span>
            </Link>
          } />
          <LandingTopFighters />
        </div>
      </section>

      <footer
        style={{
          padding: "40px 56px",
          color: "rgba(255,255,255,0.72)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <YapMark size={16} />
            <span
              style={{
                fontFamily: "var(--yap-font-display-2)",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              © 2026 Yap · Built on 0G
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--yap-font-display-2)",
              display: "flex",
              gap: 20,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              data-cursor="link"
              data-cursor-tag="DOCS"
            >
              Docs
            </a>
            <a
              href={activeChain.blockExplorers.default.url}
              target="_blank"
              rel="noreferrer"
              data-cursor="link"
              data-cursor-tag="EXPLORER"
            >
              Explorer
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              data-cursor="link"
              data-cursor-tag="GITHUB"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Promoter section header — § num + Anton display title + crimson rule
 *  + optional right-side action. */
function SectionHead({
  num,
  title,
  right,
}: {
  num: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: 3,
          color: "var(--yap-crimson)",
          textTransform: "uppercase",
        }}
      >
        {num}
      </span>
      <h2
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 400,
          fontSize: 38,
          lineHeight: 1,
          textTransform: "uppercase",
          letterSpacing: "-0.01em",
          color: "var(--yap-ink-50)",
          margin: 0,
        }}
      >
        {title}
      </h2>
      <span
        style={{
          flex: 1,
          height: 1,
          background: "var(--yap-ink-600)",
          marginLeft: 12,
        }}
      />
      {right}
    </div>
  );
}
