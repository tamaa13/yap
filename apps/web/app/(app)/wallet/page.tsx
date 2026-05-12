"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatCard } from "@/components/ui/stat-card";
import { PageContainer } from "@/components/shell/page-container";
import { GateScreen } from "@/components/wallet/gate-screen";
import { useBalance } from "@/hooks/use-balance";
import { useMyBets } from "@/hooks/use-my-bets";
import { useWallet } from "@/hooks/use-wallet";
import { fmtAddr } from "@/lib/format";

export default function WalletPage() {
  const { ready, connected, addr, logout } = useWallet();
  const balance = useBalance();
  const { data: bets } = useMyBets();

  if (ready && !connected) {
    return <GateScreen action="your wallet" icon="wallet" />;
  }

  const locked = bets
    .filter((b) => b.status === "active")
    .reduce((s, b) => s + b.amount, 0);
  const pnl = bets
    .filter((b) => b.status !== "active")
    .reduce((s, b) => s + (b.pnl ?? 0), 0);
  const displayBalance = balance ?? 0;

  return (
    <PageContainer>
      <h1
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 400,
          fontSize: 56,
          lineHeight: 0.9,
          letterSpacing: "-0.5px",
          textTransform: "uppercase",
          marginBottom: 8,
          color: "var(--yap-ink-50)",
        }}
      >
        Wallet
      </h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 20 }}>
        0G balance, earnings, and transaction history.
      </div>

      <div
        className="al-stats-grid-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard label="Balance" value={displayBalance.toFixed(2)} sub="0G liquid" />
        <StatCard label="Locked in bets" value={locked.toFixed(2)} sub="0G escrowed" />
        <StatCard
          label="Lifetime P/L"
          value={`${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
          sub="0G"
        />
      </div>

      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          Balance
        </div>
        <div
          className="num"
          style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}
        >
          {displayBalance.toFixed(2)}
        </div>
        <div
          className="mono"
          style={{ fontSize: 12, color: "var(--tx-tertiary)", marginBottom: 16 }}
        >
          0G · {fmtAddr(addr)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            leading={<Icon name="copy" size={14} />}
            onClick={() => addr && navigator.clipboard?.writeText(addr)}
          >
            Copy address
          </Button>
          <Button
            variant="destructive"
            leading={<Icon name="x" size={14} />}
            onClick={() => logout()}
          >
            Disconnect
          </Button>
        </div>
      </Card>

      <div className="label" style={{ marginBottom: 12 }}>
        Transaction history
      </div>
      <EmptyState
        title="Clean ledger"
        body="Mint a fighter, stake on a battle, claim a purse — your moves show up here."
      />
    </PageContainer>
  );
}
