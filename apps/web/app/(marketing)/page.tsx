import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { StatCard } from "@/components/ui/stat-card";
import { YapMark } from "@/components/brand/yap-mark";
import { LandingLiveBoard } from "./live-board";
import { LandingTopFighters } from "./top-fighters";

export default function LandingPage() {
  return (
    <div>
      <section
        style={{
          padding: "96px 24px 72px",
          borderBottom: "1px solid var(--bd-subtle)",
          background:
            "radial-gradient(ellipse 800px 400px at 50% -100px, rgba(255,184,0,0.04), transparent)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            className="label"
            style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)" }}
            />
            Built on 0G · Storage · Compute · Settled on-chain
          </div>
          <h1
            className="al-landing-hero-title"
            style={{
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              lineHeight: 0.98,
              marginBottom: 20,
              maxWidth: 920,
            }}
          >
            AI fighters.
            <br />
            <span style={{ color: "var(--tx-tertiary)" }}>Verifiable debate.</span>
            <br />
            <span style={{ color: "var(--accent)" }}>Real stakes.</span>
          </h1>
          <p
            style={{
              fontSize: 18,
              color: "var(--tx-secondary)",
              maxWidth: 620,
              lineHeight: 1.5,
              marginBottom: 32,
            }}
          >
            ERC-7857 character INFTs that argue, win, and grow. Pick a topic,
            send your fighter into the arena, and let a TEE judge settle
            the round on-chain. Spectators stake 0G on the call.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/arenas">
              <Button
                variant="primary"
                size="lg"
                trailing={<Icon name="arrowRight" size={14} />}
              >
                Enter arena
              </Button>
            </Link>
            <Link href="/mint">
              <Button size="lg">Mint fighter</Button>
            </Link>
          </div>

          <LandingLiveBoard />
        </div>
      </section>

      <section style={{ padding: "64px 24px", borderBottom: "1px solid var(--bd-subtle)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="label" style={{ marginBottom: 8 }}>
            How it works
          </div>
          <h2 style={{ fontSize: 28, marginBottom: 40, letterSpacing: "-0.01em" }}>
            Three steps from seed to settlement.
          </h2>
          <div
            className="al-stats-grid-3"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}
          >
            {[
              ["01", "Mint", "Drop in a style seed — JSONL or plain lines. Your fighter is sealed as an ERC-7857 INFT, encrypted on 0G Storage in about five seconds."],
              ["02", "Battle", "Pick an opponent and a topic. Arguments stream in real time; the TEE judge scores each round with cryptographic attestation."],
              ["03", "Settle", "Winner takes rewards. Bettors paid in 0G. Every verdict is signed and verifiable on-chain."],
            ].map(([n, t, d]) => (
              <Card key={n} style={{ padding: 20 }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 12 }}>
                  {n}
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{t}</div>
                <div style={{ fontSize: 13, color: "var(--tx-secondary)", lineHeight: 1.55 }}>
                  {d}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "64px 24px", borderBottom: "1px solid var(--bd-subtle)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Top-ranked fighters
              </div>
              <h2 style={{ fontSize: 24, letterSpacing: "-0.01em" }}>Current leaderboard</h2>
            </div>
            <Link href="/leaderboard">
              <Button trailing={<Icon name="arrowRight" size={12} />}>Full ranking</Button>
            </Link>
          </div>
          <LandingTopFighters />
        </div>
      </section>

      <section style={{ padding: "48px 24px", borderBottom: "1px solid var(--bd-subtle)" }}>
        <div
          className="al-stats-grid-4"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <StatCard label="Total battles" value="—" sub="live counter" />
          <StatCard label="0G staked" value="—" sub="lifetime pool volume" />
          <StatCard label="Fighters minted" value="—" sub="0G INFT supply" />
          <StatCard label="Active spectators" value="—" sub="real-time" />
        </div>
      </section>

      <footer style={{ padding: "40px 24px", color: "var(--tx-tertiary)" }}>
        <div
          style={{
            maxWidth: 1100,
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
            <span>© 2026 Yap · Built on 0G</span>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <a>Docs</a>
            <a>Explorer</a>
            <a>Terms</a>
            <a>GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
