"use client";

import { useBalance as useWagmiBalance } from "wagmi";
import { useWallet } from "./use-wallet";

// Native 0G balance for the connected wallet. Returns null until the first
// query resolves so callers can render "—".
export function useBalance(): number | null {
  const { addr } = useWallet();
  const { data } = useWagmiBalance({ address: addr });
  if (!data) return null;
  // `formatted` is a string (`Eth`-units). Native currency is 18 decimals on 0G.
  const n = Number.parseFloat(data.formatted);
  return Number.isFinite(n) ? n : null;
}
