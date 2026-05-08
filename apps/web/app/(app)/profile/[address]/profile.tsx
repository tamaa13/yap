"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Hash } from "@/components/ui/hash";
import { Sigil } from "@/components/ui/sigil";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageContainer } from "@/components/shell/page-container";
import { fmtAddr } from "@/lib/format";
import type { Fighter } from "@/lib/types";

export function Profile({
  address,
  isSelf,
  ownedFighters,
}: {
  address: string;
  isSelf: boolean;
  ownedFighters: Fighter[];
}) {
  const router = useRouter();

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: "Profile" },
          { label: isSelf ? "you" : fmtAddr(address) },
        ]}
      />
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 20 }}>
          <Sigil seed={address} size={80} color="var(--tx-secondary)" />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, marginBottom: 4 }}>
              {isSelf ? "you" : fmtAddr(address)}
            </h1>
            <Hash value={address} copy />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
                marginTop: 16,
              }}
            >
              <div>
                <div className="label">Fighters</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>
                  {ownedFighters.length}
                </div>
              </div>
              <div>
                <div className="label">Bets placed</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>—</div>
              </div>
              <div>
                <div className="label">Win rate</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>—</div>
              </div>
              <div>
                <div className="label">P/L</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>—</div>
              </div>
            </div>
          </div>
        </div>
      </Card>
      <div className="label" style={{ marginBottom: 10 }}>
        Fighters owned
      </div>
      {ownedFighters.length === 0 ? (
        <EmptyState
          icon="user"
          title={isSelf ? "Empty roster" : "Quiet profile"}
          body={isSelf ? "Mint a fighter and stake your claim." : "Hasn't minted a fighter yet."}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {ownedFighters.map((f) => (
            <Card
              key={f.id}
              interactive
              onClick={() => router.push(`/fighters/${f.id}`)}
              style={{ padding: 14, display: "flex", gap: 10, alignItems: "center" }}
            >
              <Sigil seed={f.name} size={44} color={f.color} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>
                  ELO {f.elo}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
