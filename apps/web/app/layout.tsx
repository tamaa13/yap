import type { Metadata } from "next";
import { Anton, Archivo, Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Promoter design direction — fight-poster editorial. Anton handles
// display caps (hero, section heads, card titles, KO stamps); Archivo
// is the body workhorse with full weight range for label/heading
// hierarchy; Space Mono lands on numerics and IDs (token addresses,
// 0G amounts, ELO) where the slab letterforms read as "data".
//
// Display weight is locked at 400 — Anton ships a single weight by
// design; loading more would 404. Archivo carries 400-900 because
// data-rich pages call for serious heading weight headroom. Space
// Mono pulls 400 and 700 — bold mono lands on stamp serials + table
// emphasis cells.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
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
      className={`${archivo.variable} ${anton.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
