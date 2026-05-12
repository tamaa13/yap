"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { ToastProvider } from "@/components/ui/toast";
import { ConnectPanel } from "@/components/wallet/connect-panel";
import { zg0GChain, zg0GTestnet } from "@/lib/chains";

const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "placeholder";

// Explicit wallet roster — Coinbase Wallet deliberately excluded.
// `@base-org/account` (Coinbase's Smart Wallet SDK, loaded as a
// peer dep when coinbaseWallet is in the connector list) probes
// the current URL via a HEAD request to check the COOP header on
// init. When the user lands on a 404 surface, that HEAD returns
// 404 and the SDK fires `console.error('Error checking Cross-
// Origin-Opener-Policy: HTTP error! status: 404')`. Next.js dev
// surfaces that error as a full-screen overlay popup. Dropping
// the coinbaseWallet connector removes the dep entirely, kills
// the dev-overlay noise, and shrinks the bundle.
//
// Yap runs on the 0G chain; Coinbase Smart Wallet has minimal
// value-add for this demo. Re-add via a custom connector config
// if needed later (set COOP header in next config first).
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        metaMaskWallet,
        rabbyWallet,
        rainbowWallet,
        walletConnectWallet,
      ],
    },
    {
      groupName: "Other",
      wallets: [phantomWallet, injectedWallet],
    },
  ],
  {
    appName: "Yap",
    projectId: WALLETCONNECT_PROJECT_ID,
  },
);

const config = createConfig({
  connectors,
  chains: [zg0GTestnet, zg0GChain],
  transports: {
    [zg0GTestnet.id]: http(),
    [zg0GChain.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            // Experiment palette: sodium amber on near-black ground.
            // Hex literals because RainbowKit's theme contract takes
            // strings, not CSS vars — keep them in sync with
            // `--yap-crimson` and `--yap-ink-900` in globals.css.
            accentColor: "#E69500",
            accentColorForeground: "#F4ECDB",
            borderRadius: "small",
            fontStack: "system",
          })}
          modalSize="compact"
        >
          <ToastProvider>
            {children}
            <ConnectPanel />
          </ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
