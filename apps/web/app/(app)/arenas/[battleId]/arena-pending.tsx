"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hash } from "@/components/ui/hash";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Sigil } from "@/components/ui/sigil";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageContainer } from "@/components/shell/page-container";
import {
  useAcceptBattle,
  useDeclineBattle,
} from "@/hooks/use-accept-battle";
import { useWallet } from "@/hooks/use-wallet";
import { fmtRemaining } from "@/lib/format";
import { parseBattleId } from "@/lib/on-chain";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import type { Battle, Fighter } from "@/lib/types";

const CHALLENGE_EXPIRY_MS = 24 * 3600 * 1000;

/**
 * Shown when a battle is in `Pending` state. The challenger sees a "waiting
 * for defender" view, the defender sees accept/decline buttons, and anyone
 * else sees an "awaiting acceptance" spectator view.
 */
export function ArenaPending({
  uiId,
  battle,
  fighterA,
  fighterB,
}: {
  uiId: string;
  battle: Battle;
  fighterA: Fighter;
  fighterB: Fighter;
}) {
  const router = useRouter();
  const { push } = useToast();
  const { addr } = useWallet();
  const accept = useAcceptBattle();
  const decline = useDeclineBattle();

  const idBig = parseBattleId(uiId);
  const battleIdNum = idBig !== null ? Number(idBig) : 0;

  // Read the challenger's stake (poolA) from the contract so we can enforce
  // the 75% minimum defender match in the UI before hitting chain.
  const { data: chainBattle } = useReadContract({
    address: BATTLE_ESCROW_ADDRESS as `0x${string}`,
    abi: BATTLE_ESCROW_ABI,
    functionName: "battles",
    args: idBig !== null ? [idBig] : undefined,
    query: { enabled: idBig !== null && BATTLE_ESCROW_ADDRESS !== "" },
  });
  const poolAWei = chainBattle
    ? Array.isArray(chainBattle)
      ? (chainBattle[8] as bigint)
      : ((chainBattle as { poolA: bigint }).poolA)
    : 0n;
  const challengerStakeEth = Number(formatEther(poolAWei));
  // 75% of challenger stake = minimum defender stake. Round up slightly to
  // avoid rounding-trim collisions with the BPS math in the contract.
  const minDefenderStakeEth = challengerStakeEth * 0.75;

  const [defenderStake, setDefenderStake] = useState("");
  // Default defender stake = full match once we know the challenger amount.
  useEffect(() => {
    if (challengerStakeEth > 0 && defenderStake === "") {
      setDefenderStake(challengerStakeEth.toString());
    }
  }, [challengerStakeEth, defenderStake]);

  const defenderStakeNum = Number(defenderStake);
  const stakeBelowMin =
    !Number.isFinite(defenderStakeNum) ||
    defenderStakeNum + 1e-9 < minDefenderStakeEth; // epsilon for float compare

  // createdAt = startTime in Pending mode (BattleEscrow.createBattle sets
  // startTime = block.timestamp until acceptBattle overwrites it).
  const createdAt = battle.startedAt ?? Date.now();
  const expiresAt = createdAt + CHALLENGE_EXPIRY_MS;

  const lu = addr?.toLowerCase();
  const isChallenger =
    !!lu && fighterA.owner.toLowerCase() === lu;
  const isDefender = !!lu && fighterB.owner.toLowerCase() === lu;

  const onAccept = async () => {
    try {
      const tx = await accept.write(battleIdNum, {
        stakeEth: defenderStake || "0",
      });
      push({ kind: "success", text: `Accepted · tx ${tx.slice(0, 10)}…` });
      setTimeout(() => router.refresh(), 1500);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Accept failed",
      });
    }
  };

  const onDecline = async () => {
    try {
      const tx = await decline.write(battleIdNum);
      push({ kind: "default", text: `Declined · tx ${tx.slice(0, 10)}…` });
      setTimeout(() => router.push("/arenas"), 1500);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Decline failed",
      });
    }
  };

  return (
    <PageContainer>
      <Breadcrumbs
        items={[{ label: "Arenas", to: "/arenas" }, { label: battle.id }]}
      />

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 18,
            gap: 12,
          }}
        >
          <div>
            <Badge tone="warning">
              <Icon name="clock" size={10} />
              &nbsp;Pending acceptance
            </Badge>
            <h1
              style={{
                fontSize: 22,
                marginTop: 10,
                marginBottom: 6,
                lineHeight: 1.3,
              }}
            >
              {battle.topic}
            </h1>
            <div style={{ fontSize: 12, color: "var(--tx-tertiary)" }}>
              Challenge expires {fmtRemaining(expiresAt)}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 20,
            padding: "14px 0",
            borderTop: "1px solid var(--bd-subtle)",
            borderBottom: "1px solid var(--bd-subtle)",
          }}
        >
          <FighterCol
            fighter={fighterA}
            role="Challenger"
            highlight={isChallenger}
          />
          <div style={{ fontSize: 12, color: "var(--tx-tertiary)" }}>VS</div>
          <FighterCol
            fighter={fighterB}
            role="Defender"
            highlight={isDefender}
            align="right"
          />
        </div>

        <div style={{ marginTop: 20 }}>
          {isDefender ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span className="label">Your stake on Side B</span>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--tx-tertiary)" }}
                  >
                    min {minDefenderStakeEth.toFixed(4)} 0G (75% of
                    challenger)
                  </span>
                </div>
                <Input
                  type="number"
                  value={defenderStake}
                  onChange={(e) => setDefenderStake(e.target.value)}
                  trailing={<span className="label">0G</span>}
                  min={minDefenderStakeEth}
                  step="0.01"
                />
                <div
                  style={{
                    fontSize: 11,
                    color: stakeBelowMin ? "var(--danger)" : "var(--tx-tertiary)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {stakeBelowMin
                    ? `Stake must be at least ${minDefenderStakeEth.toFixed(4)} 0G to accept this challenge. Zero-stake accept is disabled to prevent free-option play.`
                    : `Challenger staked ${challengerStakeEth.toFixed(4)} 0G. You must match at least 75% to accept — skin-in-the-game combat, not a lottery.`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  variant="primary"
                  leading={<Icon name="check" size={14} />}
                  disabled={
                    accept.isPending ||
                    accept.isConfirming ||
                    stakeBelowMin ||
                    challengerStakeEth === 0
                  }
                  onClick={onAccept}
                >
                  {accept.isPending
                    ? "Confirm in wallet…"
                    : accept.isConfirming
                      ? "Accepting…"
                      : stakeBelowMin
                        ? "Stake too low"
                        : "Accept challenge"}
                </Button>
                <Button
                  disabled={decline.isPending || decline.isConfirming}
                  onClick={onDecline}
                >
                  {decline.isPending
                    ? "Confirm in wallet…"
                    : decline.isConfirming
                      ? "Declining…"
                      : "Decline"}
                </Button>
              </div>
            </div>
          ) : isChallenger ? (
            <div
              style={{
                padding: 14,
                background: "var(--bg-sunken)",
                borderLeft: "2px solid var(--accent)",
                fontSize: 13,
                color: "var(--tx-secondary)",
                lineHeight: 1.55,
              }}
            >
              <div
                style={{
                  fontWeight: 500,
                  color: "var(--tx-primary)",
                  marginBottom: 4,
                }}
              >
                Waiting for the defender to respond
              </div>
              Ownership of Fighter #{fighterB.id} is{" "}
              <Hash value={fighterB.owner} /> — they need to accept in their
              Vault → Challenges tab. If they don't respond before the expiry,
              the challenge cancels automatically and no fees are lost.
              <div style={{ marginTop: 10 }}>
                <Link href="/vault">
                  <Button size="sm">Go to my Vault</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 14,
                background: "var(--bg-sunken)",
                fontSize: 13,
                color: "var(--tx-secondary)",
              }}
            >
              Awaiting acceptance by the defender. Betting opens once the
              challenge is accepted.
            </div>
          )}
        </div>
      </Card>
    </PageContainer>
  );
}

function FighterCol({
  fighter,
  role,
  highlight,
  align = "left",
}: {
  fighter: Fighter;
  role: string;
  highlight?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "right" ? "flex-end" : "flex-start",
        gap: 6,
        opacity: highlight ? 1 : 0.88,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--mono)",
          color: highlight ? "var(--accent)" : "var(--tx-tertiary)",
          textTransform: "uppercase",
          letterSpacing: 0.08,
        }}
      >
        {role}
        {highlight ? " · you" : ""}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: align === "right" ? "row-reverse" : "row",
          gap: 10,
        }}
      >
        <Sigil seed={fighter.name} size={48} color={fighter.color} />
        <div
          style={{
            textAlign: align,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>{fighter.name}</div>
          <div
            className="num"
            style={{ fontSize: 11, color: "var(--tx-tertiary)" }}
          >
            ELO {fighter.elo} · {fighter.arch}
          </div>
        </div>
      </div>
    </div>
  );
}
