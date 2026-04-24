import type { ReactNode } from "react";
import { TopNav } from "@/components/shell/top-nav";
import { WelcomeBackBanner } from "@/components/wallet/welcome-back-banner";
import { WrongNetworkBanner } from "@/components/wallet/wrong-network-banner-lazy";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WrongNetworkBanner />
      <WelcomeBackBanner />
      <TopNav />
      {children}
    </>
  );
}
