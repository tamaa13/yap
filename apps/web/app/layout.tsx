import type { Metadata } from "next";
import {
  Anonymous_Pro,
  Outfit,
  Saira_Condensed,
  Saira_Stencil_One,
} from "next/font/google";
import "./globals.css";
import { EntryGate } from "@/components/shell/entry-gate";
import { YapCursor } from "@/components/shell/yap-cursor";
import { Providers } from "./providers";

// EXPERIMENT v3 — sport-masthead identity. Stencil display + condensed
// poster sans + geometric body + retro-techy mono. Near-black ground,
// vermillion the only warm element.
//   - Saira Stencil One → hero / loud moments (single weight 400)
//   - Saira Condensed   → general display, variable 100-900
//   - Outfit            → workhorse body, variable 100-900
//   - Anonymous Pro     → coder mono, 400 + 700
const sairaStencil = Saira_Stencil_One({
  variable: "--font-stencil",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
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
      className={`${sairaStencil.variable} ${sairaCondensed.variable} ${outfit.variable} ${anonymousPro.variable}`}
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
