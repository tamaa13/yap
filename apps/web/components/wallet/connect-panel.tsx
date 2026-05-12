"use client";

import { useEffect, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { YapMark } from "@/components/brand/yap-mark";
import { onConnectRequest, useWallet } from "@/hooks/use-wallet";

// Contextual wrapper around RainbowKit's native connect modal. When a gate
// opens the panel, we show the "you're about to…" copy and a single CTA that
// hands off to RainbowKit for actual wallet selection.
export function ConnectPanel() {
  const { connected } = useWallet();
  const { openConnectModal } = useConnectModal();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<string | null>(null);

  useEffect(() => {
    return onConnectRequest((opts) => {
      setContext(opts.context ?? null);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (connected) setOpen(false);
  }, [connected]);

  if (!open) return null;

  const handleConnect = () => {
    setOpen(false);
    openConnectModal?.();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9000,
        padding: 20,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--bg-raised)",
          border: "1px solid var(--bd-default)",
          borderRadius: 6,
          boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--bd-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <YapMark size={22} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Connect to yap</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{ color: "var(--tx-tertiary)", display: "flex", padding: 4 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          {context && (
            <div>
              <div
                style={{
                  fontFamily: "var(--yap-font-display-2)",
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "var(--tx-tertiary)",
                  marginBottom: 4,
                }}
              >
                You&apos;re about to
              </div>
              <div
                style={{
                  fontFamily: "var(--yap-font-display)",
                  fontSize: 24,
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                  textTransform: "uppercase",
                  color: "var(--yap-ink-50)",
                }}
              >
                {context}
              </div>
            </div>
          )}

          <div>
            <div className="label" style={{ marginBottom: 8 }}>Why connect</div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                fontSize: 13,
                color: "var(--tx-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--accent)" }}>→</span> Mint AI fighters as INFTs
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--accent)" }}>→</span> Place verifiable bets on live battles
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--accent)" }}>→</span> Earn 0G from fighter rentals
              </li>
            </ul>
          </div>

          <Button variant="primary" size="lg" fullWidth onClick={handleConnect}>
            Connect wallet
          </Button>

          <p
            style={{
              fontSize: 11,
              color: "var(--tx-tertiary)",
              textAlign: "center",
              margin: 0,
            }}
          >
            MetaMask, Coinbase, Rainbow, WalletConnect, and more.
          </p>

          <div
            style={{
              padding: "10px 12px",
              background: "var(--bg-sunken)",
              borderRadius: 4,
              fontSize: 11,
              color: "var(--tx-tertiary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="shield" size={12} />
            Self-custodial. We never see your private keys.
          </div>
        </div>

        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid var(--bd-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button onClick={() => setOpen(false)} style={{ fontSize: 13, color: "var(--tx-secondary)" }}>
            Continue as spectator
          </button>
          <span
            style={{
              fontSize: 11,
              color: "var(--tx-tertiary)",
              fontFamily: "var(--mono)",
            }}
          >
            0G Chain
          </span>
        </div>
      </div>
    </div>
  );
}
