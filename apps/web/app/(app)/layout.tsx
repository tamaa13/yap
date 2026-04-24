import type { ReactNode } from "react";
import { TopNav } from "@/components/shell/top-nav";
import { SpectatorBanner } from "@/components/wallet/spectator-banner";
import { WelcomeBackBanner } from "@/components/wallet/welcome-back-banner";
import { WrongNetworkBanner } from "@/components/wallet/wrong-network-banner-lazy";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WrongNetworkBanner />
      <WelcomeBackBanner />
      <SpectatorBanner />
      <TopNav />
      {children}
    </>
  );
}
