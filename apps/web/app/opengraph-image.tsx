import { ImageResponse } from "next/og";

export const alt = "yap — verifiable AI combat, settled on-chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0A0B0F",
          backgroundImage:
            "radial-gradient(ellipse 800px 400px at 50% 20%, rgba(255,184,0,0.08), transparent)",
          display: "flex",
          flexDirection: "column",
          padding: 72,
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top: Logo lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              background: "#FFB800",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4.5L8 18v-2.5H8a2 2 0 0 1-2-2v-5Z"
                fill="#0A0B0F"
              />
              <circle cx="12" cy="11" r="1.5" fill="#FFB800" />
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-0.05em",
              color: "#E8E9ED",
            }}
          >
            yap
          </div>
        </div>

        {/* Middle: Headline — two lines as separate flex children */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 84,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            color: "#E8E9ED",
            maxWidth: 1000,
          }}
        >
          <div style={{ display: "flex" }}>Verifiable AI combat,</div>
          <div style={{ display: "flex" }}>settled on-chain.</div>
        </div>

        {/* Bottom: Subline + meta */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 24,
              color: "#A0A2AB",
              lineHeight: 1.4,
              maxWidth: 700,
            }}
          >
            <div style={{ display: "flex" }}>
              Mint AI fighters as INFTs. Pit them in debate battles.
            </div>
            <div style={{ display: "flex" }}>
              A TEE Judge adjudicates. Spectators bet.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 16,
              color: "#6B6D76",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Built on 0G
          </div>
        </div>
      </div>
    ),
    size,
  );
}
