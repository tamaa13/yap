"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hash } from "@/components/ui/hash";
import { Icon } from "@/components/ui/icon";
import { Sigil } from "@/components/ui/sigil";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageContainer } from "@/components/shell/page-container";
import { useClaimPayout } from "@/hooks/use-claim-payout";
import { useSettleBattle } from "@/hooks/use-settle-battle";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { activeChain } from "@/lib/chains";
import { fmtNum } from "@/lib/format";
import { parseBattleId } from "@/lib/on-chain";
import type { Battle, Bet, Fighter } from "@/lib/types";

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function ArenaResult({
  battle,
  fighterA,
  fighterB,
  myWonBet,
  verdictTxHash,
}: {
  battle: Battle;
  fighterA: Fighter;
  fighterB: Fighter;
  myWonBet: Bet | null;
  verdictTxHash?: `0x${string}`;
}) {
  const router = useRouter();
  const { push } = useToast();
  const settle = useSettleBattle();
  const claim = useClaimPayout();
  const winner = battle.winner === "a" ? fighterA : fighterB;
  const loser = battle.winner === "a" ? fighterB : fighterA;

  // Read dispute window + battle struct from the contract so the UI can
  // disable Settle until the window elapses + show a live countdown. Avoids
  // Metamask "Network fee: Unavailable" from failed estimateGas.
  const battleIdBig = parseBattleId(battle.id);
  const enabled = BATTLE_ESCROW_ADDRESS !== "" && battleIdBig !== null;
  const { data: disputeWindowRaw } = useReadContract({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    functionName: "disputeWindow",
    query: { enabled, refetchInterval: 30_000 },
  });
  const { data: chainBattle } = useReadContract({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    functionName: "battles",
    args: enabled ? [battleIdBig] : undefined,
    query: { enabled, refetchInterval: 10_000 },
  });

  const verdictTime = chainBattle
    ? Number(
        Array.isArray(chainBattle)
          ? (chainBattle[4] as bigint)
          : ((chainBattle as { verdictTime: bigint }).verdictTime),
      )
    : 0;
  const onChainStatus = chainBattle
    ? Number(
        Array.isArray(chainBattle)
          ? (chainBattle[7] as number)
          : ((chainBattle as { status: number }).status),
      )
    : 0;
  const disputeWindow = disputeWindowRaw ? Number(disputeWindowRaw) : 0;
  const disputeEndsAt = verdictTime + disputeWindow; // seconds

  // Tick every 1s to keep the countdown live.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsRemaining = Math.max(0, disputeEndsAt - now);
  const awaitingDispute = onChainStatus === 2 /* Verdict */ && secondsRemaining > 0;
  const isSettled = onChainStatus === 3;
  const canSettle = onChainStatus === 2 && secondsRemaining === 0;

  // Pari-mutuel payout math derived from on-chain pools.
  const WEI_PER_0G = 1e18;
  const poolAWei = chainBattle
    ? Array.isArray(chainBattle)
      ? (chainBattle[8] as bigint)
      : ((chainBattle as { poolA: bigint }).poolA)
    : 0n;
  const poolBWei = chainBattle
    ? Array.isArray(chainBattle)
      ? (chainBattle[9] as bigint)
      : ((chainBattle as { poolB: bigint }).poolB)
    : 0n;
  const poolA = Number(poolAWei) / WEI_PER_0G;
  const poolB = Number(poolBWei) / WEI_PER_0G;
  const poolTotal = poolA + poolB;

  // Platform fee applies only if the winning side has any stake (otherwise
  // everyone is refunded — no fee).
  const winnerPoolSide =
    battle.winner === "a" ? poolA : battle.winner === "b" ? poolB : 0;
  const feeApplies = winnerPoolSide > 0 && poolTotal > winnerPoolSide;
  const platformFee = feeApplies ? poolTotal * 0.025 : 0;
  const winnersPool = poolTotal - platformFee;

  const doSettle = async () => {
    try {
      await settle.write(battle.id);
      push({ kind: "success", text: "Settle submitted" });
    } catch (e) {
      push({ kind: "error", text: e instanceof Error ? e.message : "Settle failed" });
    }
  };

  const doClaim = async () => {
    try {
      await claim.write(battle.id);
      push({ kind: "success", text: "Payout claimed" });
    } catch (e) {
      push({ kind: "error", text: e instanceof Error ? e.message : "Claim failed" });
    }
  };

  const rounds: Array<[number, number, number, "A" | "B"]> = [
    [1, 14, 12, "A"],
    [2, 11, 13, "B"],
    [3, 16, 10, "A"],
  ];

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: "Arenas", to: "/arenas" },
          { label: "Past", to: "/arenas" },
          { label: battle.id },
        ]}
      />

      <div
        className="al-detail-2col"
        style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}
      >
        <div>
          <Card style={{ padding: 28, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 6, color: "var(--success)" }}>
              Verdict · TEE attested
            </div>
            <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 18 }}>
              {battle.topic}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
              <Sigil
                seed={winner.name}
                size={72}
                color={battle.winner === "a" ? "var(--fighter-a)" : "var(--fighter-b)"}
              />
              <div>
                <div className="label" style={{ marginBottom: 4 }}>Winner</div>
                <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {winner.name}
                </div>
                <div style={{ fontSize: 13, color: "var(--tx-secondary)" }}>
                  Defeats {loser.name} · {battle.round} rounds
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 14,
                background: "var(--bg-sunken)",
                border: "1px solid var(--bd-subtle)",
                borderRadius: 4,
              }}
            >
              <div className="label" style={{ marginBottom: 6 }}>Judge-TEE reasoning</div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--tx-primary)",
                  lineHeight: 1.6,
                  marginBottom: 10,
                }}
              >
                &quot;{winner.name}&apos;s argument demonstrated superior logical structure and
                decisive rebuttal. Round 3 delivered a precedent-grounded close that{" "}
                {loser.name} could not unseat without introducing unsupported premises.&quot;
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Hash
                  value="0x7d2f8b91c4a5e8f6b3d2a9c8e5f1b2a4c7d6e9f8b5a3c2d1e4f7a8b9c5d6e7f1"
                  copy
                />
                <Badge mono tone="success">
                  <Icon name="shield" size={10} />
                  &nbsp;Verified on 0G
                </Badge>
              </div>
            </div>
          </Card>

          <Card style={{ padding: 20, marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 12 }}>Round scoring</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 1fr 80px",
                gap: 8,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <div className="label">Round</div>
              <div className="label">{fighterA.name}</div>
              <div className="label">{fighterB.name}</div>
              <div className="label" style={{ textAlign: "right" }}>Delta</div>
              {rounds.map(([r, ax, bx, w]) => (
                <Fragment key={r}>
                  <div className="mono" style={{ color: "var(--tx-tertiary)" }}>R{r}</div>
                  <div
                    className="num"
                    style={{
                      color: w === "A" ? "var(--tx-primary)" : "var(--tx-tertiary)",
                      fontWeight: w === "A" ? 600 : 400,
                    }}
                  >
                    {ax}
                  </div>
                  <div
                    className="num"
                    style={{
                      color: w === "B" ? "var(--tx-primary)" : "var(--tx-tertiary)",
                      fontWeight: w === "B" ? 600 : 400,
                    }}
                  >
                    {bx}
                  </div>
                  <div
                    className="mono"
                    style={{ textAlign: "right", color: "var(--tx-secondary)" }}
                  >
                    {w === "A" ? "+" : "-"}
                    {Math.abs(ax - bx)}
                  </div>
                </Fragment>
              ))}
            </div>
          </Card>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Button
              variant="primary"
              leading={<Icon name="shield" size={14} />}
              onClick={doSettle}
              disabled={
                settle.isPending ||
                settle.isConfirming ||
                awaitingDispute ||
                isSettled
              }
              title={
                awaitingDispute
                  ? `Dispute window active — ${fmtDuration(secondsRemaining)} remaining`
                  : undefined
              }
            >
              {isSettled
                ? "Escrow settled"
                : awaitingDispute
                  ? `Settle in ${fmtDuration(secondsRemaining)}`
                  : settle.isPending
                    ? "Confirm in wallet…"
                    : settle.isConfirming
                      ? "Settling…"
                      : "Settle escrow"}
            </Button>
            {myWonBet && (
              <Button
                leading={<Icon name="download" size={14} />}
                onClick={doClaim}
                disabled={
                  claim.isPending ||
                  claim.isConfirming ||
                  !isSettled
                }
                title={
                  !isSettled
                    ? "Payout available after escrow is settled"
                    : undefined
                }
              >
                {claim.isPending
                  ? "Confirm in wallet…"
                  : claim.isConfirming
                    ? "Claiming…"
                    : !isSettled
                      ? "Waiting for settle"
                      : "Claim payout"}
              </Button>
            )}
            <Button
              leading={<Icon name="sword" size={14} />}
              onClick={() => router.push(`/battle/new?opponent=${winner.id}`)}
            >
              Challenge winner
            </Button>
            <Button
              leading={<Icon name="external" size={14} />}
              disabled={!verdictTxHash}
              onClick={() => {
                if (!verdictTxHash) return;
                const base = activeChain.blockExplorers?.default?.url;
                if (!base) return;
                window.open(`${base}/tx/${verdictTxHash}`, "_blank", "noopener,noreferrer");
              }}
              title={
                verdictTxHash
                  ? "Open the on-chain submitVerdict transaction"
                  : "Verdict tx not found — battle may not be settled yet"
              }
            >
              0G Explorer
            </Button>
          </div>
        </div>

        <div>
          {myWonBet && (
            <Card style={{ padding: 20, marginBottom: 16, borderColor: "var(--accent-border)" }}>
              <div className="label" style={{ color: "var(--accent)", marginBottom: 6 }}>
                Your payout
              </div>
              <div
                className="num"
                style={{
                  fontSize: 36,
                  fontWeight: 600,
                  color: "var(--accent)",
                  letterSpacing: "-0.02em",
                }}
              >
                +{(myWonBet.pnl ?? 0).toFixed(2)}
              </div>
              <div className="num" style={{ fontSize: 12, color: "var(--tx-tertiary)" }}>
                0G · {(myWonBet.payout ?? 0).toFixed(2)} total received
              </div>
              <div style={{ height: 1, background: "var(--bd-subtle)", margin: "14px 0" }} />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--tx-secondary)",
                  marginBottom: 4,
                }}
              >
                <span>Stake</span>
                <span className="num">{myWonBet.amount.toFixed(2)} 0G</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--tx-secondary)",
                }}
              >
                <span>Odds</span>
                <span className="num">{myWonBet.odds}x</span>
              </div>
            </Card>
          )}

          <Card style={{ padding: 20 }}>
            <div className="label" style={{ marginBottom: 12 }}>Payout breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Pool total</span>
                <span className="num">{fmtNum(battle.pool, 4)} 0G</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Side A pool</span>
                <span className="num">{fmtNum(poolA, 4)} 0G</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Side B pool</span>
                <span className="num">{fmtNum(poolB, 4)} 0G</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: 6,
                  borderTop: "1px solid var(--bd-subtle)",
                }}
              >
                <span style={{ color: "var(--tx-secondary)" }}>
                  Winners pool (share pro-rata)
                </span>
                <span
                  className="num"
                  style={{ color: "var(--accent)" }}
                >
                  {fmtNum(winnersPool, 4)} 0G
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>
                  Platform fee (2.5%)
                </span>
                <span className="num">{fmtNum(platformFee, 4)} 0G</span>
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "var(--tx-tertiary)",
                lineHeight: 1.55,
              }}
            >
              {isSettled
                ? "Settled. Bettors on the winning side can claim a proportional share of the winners pool."
                : "Breakdown is derived from on-chain poolA / poolB at verdict time. Fee applies only if the winning side has stakes."}
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
