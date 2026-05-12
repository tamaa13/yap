"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { PageContainer } from "@/components/shell/page-container";
import { useWallet } from "@/hooks/use-wallet";

export default function ConnectPage() {
  const { login, connected } = useWallet();

  return (
    <PageContainer maxWidth={520} padding={80}>
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--yap-font-display)",
            fontWeight: 400,
            fontSize: "clamp(40px, 6vw, 64px)",
            lineHeight: 0.95,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: "var(--yap-ink-50)",
            margin: "0 0 18px",
          }}
        >
          {connected ? "Wallet connected" : "Connect a wallet"}
        </h1>
        <p
          style={{
            fontFamily: "var(--yap-font-body)",
            fontSize: 15,
            color: "rgba(255,255,255,0.85)",
            margin: "0 auto 32px",
            lineHeight: 1.55,
            maxWidth: "44ch",
          }}
        >
          {connected
            ? "You're in. Step into the ring."
            : "Connect a wallet to mint, battle, and stake on 0G. About ten seconds."}
        </p>

        {connected ? (
          <Link href="/arenas">
            <button
              style={{
                padding: "14px 22px",
                background: "var(--yap-crimson)",
                color: "var(--yap-ink-900)",
                border: "1px solid var(--yap-crimson)",
                borderRadius: 4,
                fontFamily: "var(--yap-font-display)",
                fontSize: 15,
                fontWeight: 400,
                letterSpacing: 1,
                textTransform: "uppercase",
                cursor: "pointer",
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              Enter the arena
              <Icon name="arrowRight" size={14} />
            </button>
          </Link>
        ) : (
          <button
            onClick={login}
            style={{
              padding: "14px 22px",
              background: "var(--yap-crimson)",
              color: "var(--yap-ink-900)",
              border: "1px solid var(--yap-crimson)",
              borderRadius: 4,
              fontFamily: "var(--yap-font-display)",
              fontSize: 15,
              fontWeight: 400,
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: "pointer",
              display: "inline-flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            Connect wallet
            <Icon name="arrowRight" size={14} />
          </button>
        )}

        <div
          style={{
            fontFamily: "var(--yap-font-mono)",
            fontSize: 11,
            color: "rgba(255,255,255,0.6)",
            marginTop: 32,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          By connecting you agree to the terms · on-chain actions are final
        </div>
      </div>
    </PageContainer>
  );
}
