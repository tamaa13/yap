"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { openConnectPanel, useWallet } from "@/hooks/use-wallet";

const STORAGE_KEY = "yap-spectator-dismissed";

export function SpectatorBanner() {
  const { ready, connected } = useWallet();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {}
  }, []);

  if (!ready || connected || dismissed) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 20px",
        background: "var(--bg-raised)",
        borderBottom: "1px solid var(--bd-subtle)",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <Icon name="eye" size={13} style={{ color: "var(--tx-tertiary)" }} />
      <span style={{ color: "var(--tx-secondary)" }}>
        You&apos;re in spectator mode. Connect a wallet to bet, mint, or earn.
      </span>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => openConnectPanel()}
        style={{
          fontSize: 12,
          color: "var(--accent)",
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Connect wallet <Icon name="arrowRight" size={11} />
      </button>
      <button
        onClick={() => {
          try {
            localStorage.setItem(STORAGE_KEY, "true");
          } catch {}
          setDismissed(true);
        }}
        style={{ color: "var(--tx-tertiary)", padding: 4, display: "flex" }}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
