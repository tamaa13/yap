import type { ReactNode } from "react";
import { RouteCrossfade } from "@/components/shell/route-crossfade";
import { TopNav } from "@/components/shell/top-nav";
import { WrongNetworkBanner } from "@/components/wallet/wrong-network-banner-lazy";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WrongNetworkBanner />
      <TopNav />
      <RouteCrossfade>{children}</RouteCrossfade>
    </>
  );
}
