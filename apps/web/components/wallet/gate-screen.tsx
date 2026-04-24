"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { openConnectPanel } from "@/hooks/use-wallet";
import { PageContainer } from "@/components/shell/page-container";

export interface GateScreenProps {
  action?: string;
  body?: string;
  icon?: IconName;
}

export function GateScreen({ action = "this page", body, icon = "lock" }: GateScreenProps) {
  return (
    <PageContainer maxWidth={520} padding={80}>
      <Card style={{ padding: 40, textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Icon name={icon} size={22} style={{ color: "var(--accent)" }} />
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 10, letterSpacing: "-0.01em" }}>
          Connect to access {action}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--tx-secondary)",
            marginBottom: 24,
            lineHeight: 1.55,
          }}
        >
          {body ??
            "You'll need to connect a wallet to continue. It takes about ten seconds."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
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
      </Card>
    </PageContainer>
  );
}
