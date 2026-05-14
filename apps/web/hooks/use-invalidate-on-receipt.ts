"use client";

// Tiny effect helper: when a tx receipt flips to confirmed, invalidate
// the wagmi `readContract` query family so any mounted hooks doing
// on-chain reads (useFighters, useListing, useFighter, etc.) re-fetch
// fresh state without a manual page refresh.
//
// Wagmi v2 nests every useReadContract under a tanstack-query key
// starting with `['readContract', { … }]`, so a single `invalidateQueries
// ({ queryKey: ['readContract'] })` busts the whole family. Cost is one
// round of re-reads across mounted hooks — acceptable for a post-tx
// settle, and required for the marketplace not to keep showing a stale
// "for sale" state after a buy / rent / cancel succeeds.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useInvalidateOnReceipt(success: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!success) return;
    void queryClient.invalidateQueries({ queryKey: ["readContract"] });
  }, [success, queryClient]);
}
