"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// wagmi + RainbowKit touch `localStorage` at module init (even under
// "use client"), which throws during Next.js server render. Load the real
// provider tree only on the client via next/dynamic(ssr: false).
const WalletProviders = dynamic(
  () => import("./providers-client").then((m) => m.WalletProviders),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
