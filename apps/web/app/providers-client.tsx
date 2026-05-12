"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { ReactNode } from "react";
import { WagmiProvider, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { ToastProvider } from "@/components/ui/toast";
import { ConnectPanel } from "@/components/wallet/connect-panel";
import { zg0GChain, zg0GTestnet } from "@/lib/chains";

const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "placeholder";

const config = getDefaultConfig({
  appName: "Yap",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [zg0GTestnet, zg0GChain],
  transports: {
    [zg0GTestnet.id]: http(),
    [zg0GChain.id]: http(),
  },
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
