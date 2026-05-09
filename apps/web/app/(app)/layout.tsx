import type { ReactNode } from "react";
import { RouteCrossfade } from "@/components/shell/route-crossfade";
import { TopNav } from "@/components/shell/top-nav";
import { SpectatorBanner } from "@/components/wallet/spectator-banner";
import { WrongNetworkBanner } from "@/components/wallet/wrong-network-banner-lazy";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WrongNetworkBanner />
      <SpectatorBanner />
      <TopNav />
      <RouteCrossfade>{children}</RouteCrossfade>
    </>
  );
}
