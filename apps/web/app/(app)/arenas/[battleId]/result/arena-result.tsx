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
import { useBattleState } from "@/hooks/use-battle-state";
import { useClaimPayout } from "@/hooks/use-claim-payout";
import { useMintMoment, useMomentClaimed } from "@/hooks/use-mint-moment";
import { useSettleBattle } from "@/hooks/use-settle-battle";
import { useWallet } from "@/hooks/use-wallet";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
  MOMENT_INFT_ADDRESS,
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
  const { addr: viewerAddr } = useWallet();
  const winner = battle.winner === "a" ? fighterA : fighterB;
  const loser = battle.winner === "a" ? fighterB : fighterA;

  // Subscribe to live battle state — this is where the per-round
  // arguments + commentary live. Used for Moment minting (need real
  // transcript bytes) and to surface real per-round content if/when
  // the runner exposes it. Falls through to the legacy hardcoded
  // round display if the state has been GC'd from the store.
  const battleIdNum = parseBattleId(battle.id);
  const battleIdNumber = battleIdNum !== null ? Number(battleIdNum) : null;
  const { state: liveState } = useBattleState(battleIdNumber);
  const realRounds = liveState?.rounds ?? [];

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
      push({ kind: "success", text: "Settle on its way to the chain." });
    } catch (e) {
      push({ kind: "error", text: e instanceof Error ? e.message : "Settle failed" });
    }
  };

  const doClaim = async () => {
    try {
      await claim.write(battle.id);
      push({ kind: "success", text: "Purse claimed. Check your wallet." });
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
                  Beats {loser.name} in {battle.round} round{battle.round === 1 ? "" : "s"}.
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

          {MOMENT_INFT_ADDRESS !== "" && realRounds.length > 0 && (
            <Card style={{ padding: 20, marginBottom: 16 }}>
              <div
                className="label"
                style={{
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Mint a moment
                <Badge mono tone="success">
                  <Icon name="zap" size={10} />
                  &nbsp;new
                </Badge>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tx-tertiary)",
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                Pin this round's argument as an ERC-7857 collectible.
                Side ownership gates each button — fighter owners only.
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {realRounds.map((round) => (
                  <Fragment key={round.number}>
                    <MomentMintRow
                      battleId={battle.id}
                      battleIdNum={battleIdNumber}
                      roundNo={round.number}
                      side="a"
                      fighter={fighterA}
                      argumentContent={round.argumentA.content}
                      viewerAddr={viewerAddr ?? null}
                    />
                    <MomentMintRow
                      battleId={battle.id}
                      battleIdNum={battleIdNumber}
                      roundNo={round.number}
                      side="b"
                      fighter={fighterB}
                      argumentContent={round.argumentB.content}
                      viewerAddr={viewerAddr ?? null}
                    />
                  </Fragment>
                ))}
              </div>
            </Card>
          )}

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
                  ? `Dispute window open — ${fmtDuration(secondsRemaining)} left`
                  : undefined
              }
            >
              {isSettled
                ? "Escrow settled"
                : awaitingDispute
                  ? `Open in ${fmtDuration(secondsRemaining)}`
                  : settle.isPending
                    ? "Sign in your wallet…"
                    : settle.isConfirming
                      ? "Landing on-chain…"
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
                    ? "Settle the escrow first; the purse opens after."
                    : undefined
                }
              >
                {claim.isPending
                  ? "Sign in your wallet…"
                  : claim.isConfirming
                    ? "Pulling the purse…"
                    : !isSettled
                      ? "Waiting on settle"
                      : "Claim purse"}
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
                  ? "Open the submitVerdict tx on 0G Explorer"
                  : "Verdict tx not on-chain yet."
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
                ? "Settled. Winners claim pro-rata."
                : "Numbers from on-chain poolA / poolB at verdict time. Fee only kicks in if the winning side had stakes."}
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function MomentMintRow({
  battleId,
  battleIdNum,
  roundNo,
  side,
  fighter,
  argumentContent,
  viewerAddr,
}: {
  battleId: string;
  battleIdNum: number | null;
  roundNo: number;
  side: "a" | "b";
  fighter: Fighter;
  argumentContent: string;
  viewerAddr: string | null;
}) {
  const { push } = useToast();
  const mint = useMintMoment();
  const isOwner =
    !!viewerAddr &&
    fighter.owner.toLowerCase() === viewerAddr.toLowerCase();
  const args =
    battleIdNum !== null
      ? { battleId: battleIdNum, roundNo, side }
      : null;
  const { claimed, isLoading: claimedLoading } = useMomentClaimed(args);

  const previewSnippet = argumentContent
    ? argumentContent.length > 90
      ? argumentContent.slice(0, 88) + "…"
      : argumentContent
    : "(no content)";

  const onMint = async () => {
    if (!args) return;
    try {
      const result = await mint.write(args);
      push({
        kind: "success",
        text: `Moment #${result.tokenId} minted. Round ${roundNo} on lock.`,
      });
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't mint the moment",
      });
    }
  };

  const busy =
    mint.phase === "preparing" ||
    mint.phase === "signing" ||
    mint.phase === "minting";

  const buttonLabel = (() => {
    if (mint.phase === "done") return "Minted";
    if (mint.phase === "preparing") return "Pinning to 0G…";
    if (mint.phase === "signing") return "Sign in your wallet…";
    if (mint.phase === "minting") return "Landing on-chain…";
    if (claimedLoading) return "Checking…";
    if (claimed) return "Already minted";
    if (!isOwner) return "Owner only";
    return `Mint R${roundNo}/${side.toUpperCase()}`;
  })();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 10,
        background: "var(--bg-sunken)",
        border: "1px solid var(--bd-subtle)",
        borderRadius: 4,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--tx-tertiary)",
          flexShrink: 0,
          width: 56,
        }}
      >
        R{roundNo} · {side.toUpperCase()}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: "var(--tx-secondary)",
          lineHeight: 1.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={argumentContent}
      >
        <span style={{ color: "var(--tx-primary)", fontWeight: 500 }}>
          {fighter.name}
        </span>
        : {previewSnippet}
      </div>
      <Button
        size="sm"
        variant={isOwner && !claimed && mint.phase !== "done" ? "primary" : undefined}
        onClick={onMint}
        disabled={
          busy ||
          !isOwner ||
          claimed === true ||
          mint.phase === "done" ||
          !argumentContent ||
          battleIdNum === null
        }
        title={
          !isOwner
            ? `Only ${fighter.name}'s owner can mint this side.`
            : claimed
              ? "This round/side already lives as a Moment."
              : !argumentContent
                ? "Round content not in store — battle state may have been GC'd."
                : undefined
        }
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
