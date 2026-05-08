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

  const sections: Array<{ label: string; items: Array<[string, boolean]> }> = [
    {
      label: "Notifications",
      items: [
        ["Battle alerts", true],
        ["Payout notifications", true],
        ["New challengers", false],
        ["Email digest", false],
      ],
    },
    {
      label: "Preferences",
      items: [
        ["Show fighter stats in lobby", true],
        ["Auto-subscribe to my fighter battles", true],
        ["Compact table density", false],
      ],
    },
  ];

  return (
    <PageContainer maxWidth={720}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Settings</h1>
      {sections.map((section) => (
        <Card key={section.label} style={{ padding: 20, marginBottom: 12 }}>
          <div className="label" style={{ marginBottom: 14 }}>
            {section.label}
          </div>
          {section.items.map(([l, v]) => (
            <div
              key={l}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderTop: "1px solid var(--bd-subtle)",
              }}
            >
              <div style={{ fontSize: 13 }}>{l}</div>
              <div
                style={{
                  width: 32,
                  height: 18,
                  background: v ? "var(--accent)" : "var(--bg-sunken)",
                  borderRadius: 9,
                  border: "1px solid var(--bd-default)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 1,
                    left: v ? 15 : 1,
                    width: 14,
                    height: 14,
                    borderRadius: 99,
                    background: v ? "var(--yap-ink-950)" : "var(--tx-tertiary)",
                    transition: "left 150ms",
                  }}
                />
              </div>
            </div>
          ))}
        </Card>
      ))}
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
