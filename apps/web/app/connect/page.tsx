"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { YapMark } from "@/components/brand/yap-mark";
import { PageContainer } from "@/components/shell/page-container";
import { useWallet } from "@/hooks/use-wallet";

export default function ConnectPage() {
  const { login, connected } = useWallet();

  return (
    <PageContainer maxWidth={440} padding={80}>
      <Card style={{ padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "inline-flex", marginBottom: 14 }}>
            <YapMark size={40} />
          </div>
          <h1 style={{ fontSize: 20, marginBottom: 6 }}>
            {connected ? "Wallet connected" : "Connect wallet"}
          </h1>
          <div style={{ fontSize: 13, color: "var(--tx-secondary)" }}>
            {connected
              ? "You're good to go."
              : "Sign in to mint, battle, and bet on 0G."}
          </div>
        </div>

        {connected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Link href="/arenas">
              <button
                style={{
                  padding: "12px 14px",
                  background: "var(--accent)",
                  color: "var(--yap-ink-50)",
                  border: "1px solid var(--accent)",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Enter the arena</span>
                <Icon name="arrowRight" size={14} />
              </button>
            </Link>
          </div>
        ) : (
          <button
            onClick={login}
            style={{
              padding: "12px 14px",
              background: "var(--accent)",
              color: "var(--yap-ink-50)",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 500,
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Connect wallet</span>
            <Icon name="arrowRight" size={14} />
          </button>
        )}
        <div
          style={{
            fontSize: 11,
            color: "var(--tx-tertiary)",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          By connecting you agree to the Terms and acknowledge on-chain actions are final.
        </div>
      </Card>
    </PageContainer>
  );
}
