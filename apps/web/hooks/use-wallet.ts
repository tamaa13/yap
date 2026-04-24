"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAccount, useChainId, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

// Public shape used across the app. Preserved from the previous Privy
// implementation so screens don't need changes when the wallet layer swaps.
export interface UseWalletResult {
  ready: boolean;
  connected: boolean;
  addr: `0x${string}` | undefined;
  email: string | undefined;
  wallet: { address: `0x${string}`; chainId: number | undefined } | undefined;
  chainId: number | undefined;
  login: () => void;
  logout: () => void;
}

export function useWallet(): UseWalletResult {
  const { address, isConnected, isReconnecting, isConnecting } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();

  const wallet = address ? { address, chainId } : undefined;

  return {
    ready: !isReconnecting && !isConnecting,
    connected: isConnected,
    addr: address,
    email: undefined,
    wallet,
    chainId,
    login: () => openConnectModal?.(),
    logout: () => disconnect(),
  };
}

// ───── Connect panel event bus ─────
// Other components dispatch "yap:connect" with optional context copy. The
// ConnectPanel renders a contextual wrapper over RainbowKit's native modal.
export type ConnectRequest = { context?: string };

const CONNECT_EVENT = "yap:connect";

export function openConnectPanel(opts: ConnectRequest = {}) {
  window.dispatchEvent(new CustomEvent<ConnectRequest>(CONNECT_EVENT, { detail: opts }));
}

export function onConnectRequest(cb: (opts: ConnectRequest) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<ConnectRequest>).detail ?? {});
  window.addEventListener(CONNECT_EVENT, handler);
  return () => window.removeEventListener(CONNECT_EVENT, handler);
}

// useWalletGate: call gate(context, callback). If wallet isn't connected, opens
// ConnectPanel with the provided context and resumes the callback after auth.
export function useWalletGate() {
  const { isConnected } = useAccount();
  const pendingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    if (pendingRef.current) {
      const cb = pendingRef.current;
      pendingRef.current = null;
      const id = setTimeout(() => cb(), 180);
      return () => clearTimeout(id);
    }
  }, [isConnected]);

  return useCallback((context: string, callback: () => void) => {
    if (isConnected) {
      callback();
      return;
    }
    pendingRef.current = callback;
    openConnectPanel({ context });
  }, [isConnected]);
}
