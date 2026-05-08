"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hash } from "@/components/ui/hash";
import { PageContainer } from "@/components/shell/page-container";
import { GateScreen } from "@/components/wallet/gate-screen";
import { useWallet } from "@/hooks/use-wallet";

export default function SettingsPage() {
  const { ready, connected, addr, logout } = useWallet();

  if (ready && !connected) {
    return <GateScreen action="settings" icon="settings" />;
  }

  return (
    <PageContainer maxWidth={720}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Settings</h1>
      <Card style={{ padding: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          Connected wallet
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Privy session</div>
            {addr && <Hash value={addr} />}
          </div>
          <Button variant="destructive" size="sm" onClick={logout}>
            Disconnect
          </Button>
        </div>
      </Card>
    </PageContainer>
  );
}
