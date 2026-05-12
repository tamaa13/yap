"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { IconName } from "@/components/ui/icon";
import { openConnectPanel } from "@/hooks/use-wallet";
import { PageContainer } from "@/components/shell/page-container";

export interface GateScreenProps {
  action?: string;
  body?: string;
  /** Legacy prop, retained for backwards compat with existing callers
   *  (e.g. `<GateScreen action="the vault" icon="vault" />`). The icon
   *  is no longer rendered — the moment is carried by the title alone. */
  icon?: IconName;
}

export function GateScreen({ action = "this page", body }: GateScreenProps) {
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
          Connect to access {action}
        </h1>
        <p
          style={{
            fontFamily: "var(--yap-font-display-2)",
            fontSize: 19,
            color: "rgba(255,255,255,0.85)",
            margin: "0 auto 32px",
            lineHeight: 1.4,
            letterSpacing: 0.3,
            maxWidth: "40ch",
          }}
        >
          {body ??
            "Connect a wallet to step into the ring. About ten seconds."}
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={() => openConnectPanel({ context: `Access ${action}` })}
          >
            Connect wallet
          </Button>
          <Link href="/arenas">
            <Button size="lg">Browse arenas</Button>
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
