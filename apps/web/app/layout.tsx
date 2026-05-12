import type { Metadata } from "next";
import { Anonymous_Pro, Outfit, Saira_Condensed } from "next/font/google";
import localFont from "next/font/local";
// Rainbowkit CSS first so our globals.css can override its specificity.
// Copied verbatim from `node_modules/@rainbow-me/rainbowkit/dist/index.css`
// because the side-effect import in providers-client.tsx silently fails
// to bundle when this dev tree is run from a git worktree with symlinked
// pnpm node_modules (webpack drops the resolution; no warning). Keeping
// a local copy ensures the modal always paints regardless of resolution
// quirks. Update by re-copying the dist file when the lib bumps.
import "./_rainbowkit.css";
import "./globals.css";
import { EntryGate } from "@/components/shell/entry-gate";
import { YapCursor } from "@/components/shell/yap-cursor";
import { Providers } from "./providers";

// EXPERIMENT v5 — display swap to Riot (cdnfonts.com self-host).
// Single weight 400; hierarchy carried by size + tracking + uppercase,
// not weight. Saira Condensed retained as a chain fallback for glyph
// coverage (Riot is a stylized display face). Outfit + Anonymous Pro
// unchanged for body + mono.
const riot = localFont({
  variable: "--font-riot",
  src: "./fonts/Riot.woff",
  display: "swap",
  weight: "400",
});

const sairaCondensed = Saira_Condensed({
  variable: "--font-saira-cond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const anonymousPro = Anonymous_Pro({
  variable: "--font-anon-pro",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yap — Verifiable AI combat arena on 0G",
  description:
    "Mint AI fighters as INFTs. Stage verifiable debate battles. TEE-attested verdicts. Real stakes settled on 0G.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${riot.variable} ${sairaCondensed.variable} ${outfit.variable} ${anonymousPro.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <EntryGate>{children}</EntryGate>
        </Providers>
        <YapCursor />
      </body>
    </html>
  );
}
