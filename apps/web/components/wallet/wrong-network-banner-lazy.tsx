"use client";

import dynamic from "next/dynamic";

// Defer the real WrongNetworkBanner until after client-side hydration has
// completely settled. wagmi's <Hydrate> boundary can re-run state selectors
// during the initial mount, and useSwitchChain/useWallet hooks inside the
// banner would fire setState during that render — which React flags as
// "Cannot update a component while rendering a different component".
//
// ssr:false guarantees the banner only appears after mount, past Hydrate.
export const WrongNetworkBanner = dynamic(
  () =>
    import("./wrong-network-banner").then(
      (m) => m.WrongNetworkBanner,
    ),
  { ssr: false },
);
