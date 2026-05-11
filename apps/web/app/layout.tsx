import type { Metadata } from "next";
import {
  Boldonse,
  Caprasimo,
  DM_Mono,
  Inter_Tight,
  Newsreader,
} from "next/font/google";
import "./globals.css";
import { EntryGate } from "@/components/shell/entry-gate";
import { YapCursor } from "@/components/shell/yap-cursor";
import { Providers } from "./providers";

// Overprint design direction — Risograph zine / overprint registration.
// Cream paper, cobalt + fluo + plum accents with `mix-blend-mode:
// multiply` so paper grain pulls through every coloured surface.
//
// Type stack:
//   - Boldonse        → display (heavy stencil/condensed)
//   - Caprasimo       → poster serif (slabby ornamental)
//   - Inter Tight     → body (variable 400-800)
//   - Newsreader      → editorial italic (canonical verdict text)
//   - DM Mono         → mono (receipt labels, ids, hashes)
const boldonse = Boldonse({
  variable: "--font-boldonse",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const caprasimo = Caprasimo({
  variable: "--font-caprasimo",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${boldonse.variable} ${caprasimo.variable} ${interTight.variable} ${newsreader.variable} ${dmMono.variable}`}
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
