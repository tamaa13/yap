"use client";

import { useEffect, useState } from "react";
import { useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useWallet } from "@/hooks/use-wallet";
import { activeChain } from "@/lib/chains";

// Shift+N toggles a mock "wrong network" state for recording the demo video
// without having to actually switch chains in the wallet.
export function WrongNetworkBanner() {
  // Mounted guard: wagmi's Hydrate boundary re-runs state selectors during
  // hydration. Returning null on the first paint keeps the banner out of the
  // Hydrate tree so a wagmi-driven re-render can't trigger setState inside
  // another component's render (the React console error).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { connected, chainId } = useWallet();
  const { switchChain } = useSwitchChain();
  const [mockWrong, setMockWrong] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "N" && e.shiftKey) setMockWrong((x) => !x);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!mounted) return null;
  if (!connected) return null;
  const wrong = mockWrong || (chainId !== undefined && chainId !== activeChain.id);
  if (!wrong) return null;

  const handleSwitch = () => {
    if (mockWrong) {
      setMockWrong(false);
      return;
    }
    switchChain({ chainId: activeChain.id });
  };

  return (
    <div
      style={{
        padding: "10px 20px",
        background: "rgba(232,107,107,0.08)",
        borderBottom: "1px solid rgba(232,107,107,0.30)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        fontSize: 13,
      }}
    >
      <Icon name="alert" size={14} style={{ color: "var(--danger)" }} />
      <span style={{ color: "var(--tx-primary)" }}>
        You&apos;re on the wrong network. Yap requires 0G {activeChain.name}.
      </span>
      <div style={{ flex: 1 }} />
      <Button size="sm" variant="primary" onClick={handleSwitch}>
        Switch to 0G
      </Button>
    </div>
  );
}
