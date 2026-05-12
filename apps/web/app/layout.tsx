import type { Metadata } from "next";
import { Anonymous_Pro } from "next/font/google";
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

// FINAL FONT LOCKDOWN v21 (Tama-approved) — TWO fonts only.
//   - Poesing      → EVERYTHING (hero trinity, fighter names, page
//                     titles, body, navigation, cards, numerics,
//                     stamps, CTAs, 404 hero) via all yap-font-*
//                     display/body aliases.
//   - Anonymous Pro → Wallet addresses, tx hashes, token IDs, hex
//                     chips, form input fields.
// Riot dropped — cdnfonts source rendered too clean for Tama's
// hero-tier expectation. Poesing's grunge character handles the
// hero scale too. No Outfit, no Saira, no Big Shoulders.
const poesing = localFont({
  variable: "--font-poesing",
  src: "./fonts/Poesing.ttf",
  display: "swap",
  weight: "400",
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
      className={`${poesing.variable} ${anonymousPro.variable}`}
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
