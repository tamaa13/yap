"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { Badge, Split, Stamp } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hash } from "@/components/ui/hash";
import { Icon } from "@/components/ui/icon";
import { Sigil } from "@/components/ui/sigil";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageContainer } from "@/components/shell/page-container";
import { useBattleDAEpoch } from "@/hooks/use-battle-da-epoch";
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

function fmtUtcTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}

function shortHash(h?: string | null): string {
  if (!h) return "—";
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
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
  const winnerSide = battle.winner === "a" ? "Affirmative" : "Negative";
  const loserSide = battle.winner === "a" ? "Negative" : "Affirmative";

  const battleIdNum = parseBattleId(battle.id);
  const battleIdNumber = battleIdNum !== null ? Number(battleIdNum) : null;
  const { state: liveState } = useBattleState(battleIdNumber);
  const realRounds = liveState?.rounds ?? [];

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
  const disputeEndsAt = verdictTime + disputeWindow;

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsRemaining = Math.max(0, disputeEndsAt - now);
  const awaitingDispute = onChainStatus === 2 && secondsRemaining > 0;
  const isSettled = onChainStatus === 3;
  const canSettle = onChainStatus === 2 && secondsRemaining === 0;
  const isDisputed = onChainStatus === 4; // Disputed enum slot (best-effort)

  // Pari-mutuel payout math.
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

  const liveVerdict = liveState?.verdict ?? null;
  const verdictReasoning = liveVerdict?.reasoning ?? null;
  const effectiveVerdictTxHash = (verdictTxHash ?? liveVerdict?.txHash ?? null) as
    | `0x${string}`
    | null;
  const verdictAttestationId = liveVerdict?.zgAttestation ?? null;
  const verdictSignature = liveVerdict?.signature ?? null;

  const daEpoch = useBattleDAEpoch(battleIdNumber);

  // KV mirror state — surface as inline receipt row if enabled.
  const [kvMirror, setKvMirror] = useState<{
    kvEnabled: boolean;
    settledAt?: number;
  } | null>(null);
  useEffect(() => {
    if (battleIdNumber === null) return;
    let cancelled = false;
    fetch(`/api/battle/${battleIdNumber}/kv-snapshot`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setKvMirror({
          kvEnabled: !!data.kvEnabled,
          settledAt: data.snapshot?.verdict?.settledAt,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [battleIdNumber, effectiveVerdictTxHash]);

  // Verdict ribbon copy keys off lifecycle phase.
  const ribbonState = isSettled
    ? "signed"
    : awaitingDispute
      ? "awaiting dispute"
      : canSettle
        ? "ready to settle"
        : "pending";

  // Fallback canonical sentence when reasoning hasn't landed (or has
  // been GC'd). Always italic; never blocks the page from rendering.
  const canonical = verdictReasoning
    ? verdictReasoning
    : `For the ${winnerSide.toLowerCase()}, on the merits of ${winner.name}'s closing exchange.`;

  // Settle/claim primary CTA — same wallet-flow phases as before,
  // re-labeled and recoloured for Overprint.
  const settleLabel = isSettled
    ? "Escrow settled"
    : awaitingDispute
      ? `Open in ${fmtDuration(secondsRemaining)}`
      : settle.isPending
        ? "Sign in your wallet…"
        : settle.isConfirming
          ? "Landing on-chain…"
          : "Settle escrow";

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: "Arenas", to: "/arenas" },
          { label: "Past", to: "/arenas" },
          { label: battle.id },
        ]}
      />

      {/* ── Plum verdict hero — the showpiece ─────────────────── */}
      <section className="op-verdict">
        <div className="op-v-head">
          <span className="op-v-ribbon">
            → The verdict · canonical sentence · {ribbonState}
          </span>
          <span className="op-v-meta">
            battle <b>{battle.id}</b> · round{" "}
            <b>
              {battle.round}/{battle.maxRound}
            </b>
            {verdictTime > 0 ? <> · {fmtUtcTime(verdictTime)}</> : null}
          </span>
        </div>

        <div>
          <p className="op-v-canon">
            <em style={{ fontStyle: "italic" }}>
              {canonical.split(winnerSide.toLowerCase()).length > 1 ? (
                <>
                  {canonical.split(winnerSide.toLowerCase())[0]}
                  <span className="op-v-ico">{winnerSide.toLowerCase()}</span>
                  {canonical.split(winnerSide.toLowerCase())[1]}
                </>
              ) : (
                canonical
              )}
            </em>
          </p>
          <span
            className="op-v-rule"
            aria-hidden
            data-reveal={isSettled || awaitingDispute ? "on" : "off"}
            data-disputed={isDisputed ? "on" : "off"}
          />
        </div>

        <div className="op-v-stamp">
          <Stamp tone="gold" className="stamp-badge--loud">
            {winner.name}
            <br />
            decides
          </Stamp>
          <div className="op-v-stamp-meta">
            {winner.arch}
            <br />
            ELO <b>{winner.elo}</b>
            {effectiveVerdictTxHash ? (
              <>
                <br />
                {shortHash(effectiveVerdictTxHash)}
              </>
            ) : null}
          </div>
        </div>

        <div className="op-v-foot">
          <div className="op-v-stat">
            <div className="op-v-stat-l">→ Pot cleared</div>
            <div className="op-v-stat-v">
              {fmtNum(poolTotal, 2)}
              <span className="op-v-stat-x">OG</span>
            </div>
          </div>
          <div className="op-v-stat">
            <div className="op-v-stat-l">→ Backers paid</div>
            <div className="op-v-stat-v">
              {fmtNum(winnersPool, 2)}
              <span className="op-v-stat-x">OG</span>
            </div>
          </div>
          <div className="op-v-stat">
            <div className="op-v-stat-l">→ Dispute window</div>
            <div className="op-v-stat-v">
              {isSettled
                ? "Closed"
                : awaitingDispute
                  ? fmtDuration(secondsRemaining)
                  : canSettle
                    ? "Open"
                    : "—"}
            </div>
          </div>
          <div className="op-v-stat">
            <div className="op-v-stat-l">→ Signature</div>
            <div className="op-v-stat-v is-mono">
              {shortHash(effectiveVerdictTxHash)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Receipt + Mint moment — 2-up ───────────────────────── */}
      <section className="op-v-grid">
        <div className="op-receipt">
          <div className="op-receipt-head">
            <h3>Receipt</h3>
            <span className="op-perf">
              — — — — — — — perforate — — — — — — —
            </span>
          </div>
          <div>
            <div className="op-r-row">
              <span className="op-r-l">Bout</span>
              <span className="op-r-v">
                {battle.id} · {fighterA.name} vs {fighterB.name}
              </span>
            </div>
            <div className="op-r-row">
              <span className="op-r-l">Topic</span>
              <span className="op-r-v">{battle.topic}</span>
            </div>
            <div className="op-r-row">
              <span className="op-r-l">Settled at</span>
              <span className="op-r-v">
                {verdictTime > 0 ? fmtUtcTime(verdictTime) : "—"} ·{" "}
                <b>round {battle.round}/{battle.maxRound}</b>
              </span>
            </div>
            <div className="op-r-row">
              <span className="op-r-l">Canonical</span>
              <span className="op-r-v is-italic">“{canonical}”</span>
            </div>
            <div className="op-r-row">
              <span className="op-r-l">Judge</span>
              <span className="op-r-v">
                oracle.yap.0g
                {verdictSignature ? (
                  <span className="op-stamp-mini">verified</span>
                ) : (
                  <span
                    className="op-stamp-mini"
                    style={{ background: "var(--op-ink-mid)" }}
                  >
                    pending
                  </span>
                )}
                {daEpoch ? (
                  <span
                    className="op-stamp-mini"
                    style={{ background: "var(--op-fluo)", color: "var(--op-ink)" }}
                  >
                    0G DA · #{daEpoch.epoch}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="op-r-row">
              <span className="op-r-l">Signed bytes</span>
              <span className="op-r-v">
                {effectiveVerdictTxHash ? (
                  <Hash value={effectiveVerdictTxHash} copy />
                ) : (
                  "Verdict tx pending"
                )}
              </span>
            </div>
            {verdictAttestationId ? (
              <div className="op-r-row">
                <span className="op-r-l">TEE attestation</span>
                <span className="op-r-v">{verdictAttestationId}</span>
              </div>
            ) : null}
            {kvMirror?.kvEnabled && kvMirror.settledAt ? (
              <div className="op-r-row">
                <span className="op-r-l">0G KV mirror</span>
                <span className="op-r-v">
                  Snapshot anchored · {fmtUtcTime(kvMirror.settledAt)}
                </span>
              </div>
            ) : null}
            <div className="op-r-row">
              <span className="op-r-l">Pool</span>
              <span className="op-r-v">
                A <b>{fmtNum(poolA, 4)}</b> · B <b>{fmtNum(poolB, 4)}</b> ·
                fee <b>{fmtNum(platformFee, 4)}</b> · winners{" "}
                <b>{fmtNum(winnersPool, 4)}</b> OG
              </span>
            </div>
            {myWonBet ? (
              <div className="op-r-row">
                <span className="op-r-l">Your gain</span>
                <span className="op-r-v">
                  <b>+{(myWonBet.pnl ?? 0).toFixed(2)} OG</b> · stake{" "}
                  {myWonBet.amount.toFixed(2)} · odds {myWonBet.odds}x · payout{" "}
                  {(myWonBet.payout ?? 0).toFixed(2)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="op-mint">
          <div className="op-mint-head">
            <h3>Mint the moment</h3>
            <span className="op-mint-clock">
              {realRounds.length > 0 ? "open" : "—"}
            </span>
          </div>
          <div className="op-mint-art">
            <span className="op-mint-lab">→ Battle Moment · INFT</span>
            <h4 className="op-mint-title">
              R{battle.round}
              <br />
              Verdict
            </h4>
            <div className="op-mint-ed">{realRounds.length} / 200</div>
          </div>
          <div className="op-mint-body">
            <div className="op-mint-stats">
              <div className="op-mint-s">
                <div className="op-mint-s-l">Rounds</div>
                <div className="op-mint-s-v">
                  {realRounds.length}
                  <span className="op-mint-s-x">/ {battle.maxRound}</span>
                </div>
              </div>
              <div className="op-mint-s">
                <div className="op-mint-s-l">Mint fee</div>
                <div className="op-mint-s-v">
                  0.04
                  <span className="op-mint-s-x">OG</span>
                </div>
              </div>
              <div className="op-mint-s">
                <div className="op-mint-s-l">Royalty</div>
                <div className="op-mint-s-v is-cobalt">
                  2.5
                  <span className="op-mint-s-x">%</span>
                </div>
              </div>
              <div className="op-mint-s">
                <div className="op-mint-s-l">Sides</div>
                <div className="op-mint-s-v">A · B</div>
              </div>
            </div>
            <a
              className="btn btn--plum btn--full"
              href="#mint-moments"
              data-cursor="bet"
            >
              Mint moments below
            </a>
          </div>
        </aside>
      </section>

      {/* ── Outcome row ────────────────────────────────────────── */}
      <section className="op-out-row">
        <div className="op-out-c is-win">
          <span className="op-out-l">{winnerSide} · won</span>
          <span className="op-out-v is-cobalt">{winner.name}</span>
        </div>
        <div className="op-out-c">
          <span className="op-out-l">{loserSide}</span>
          <span className="op-out-v is-dim">{loser.name}</span>
        </div>
        <div className="op-out-c">
          <span className="op-out-l">Rounds judged</span>
          <span className="op-out-v">
            {battle.round}
            <span className="op-out-x">/ {battle.maxRound}</span>
          </span>
        </div>
        <div className="op-out-c">
          <span className="op-out-l">Dispute window</span>
          <span className="op-out-v">
            {isSettled
              ? "Closed"
              : awaitingDispute
                ? fmtDuration(secondsRemaining)
                : canSettle
                  ? "Open"
                  : "—"}
          </span>
        </div>
      </section>

      {/* ── Replay strip — links to the transcript section ───── */}
      <a
        href="#match-transcript"
        className="op-play-strip"
        style={{ textDecoration: "none" }}
      >
        <span className="op-play-lab">→ Replay</span>
        <div className="op-play-tl">
          <div className="op-play-fill" style={{ width: "100%" }} />
          <div className="op-play-head" style={{ left: "100%" }} />
        </div>
        <span className="op-play-time">
          {battle.round} / {battle.maxRound} ROUNDS
        </span>
        <div className="op-play-marks">
          {Array.from({ length: Math.max(1, battle.round) }, (_, i) => (
            <span key={i} style={{ color: "var(--op-cobalt)" }}>
              R{i + 1}
            </span>
          ))}
          <span style={{ color: "var(--op-fluo)", mixBlendMode: "multiply" }}>
            VERDICT
          </span>
        </div>
      </a>

      {/* ── Action set ────────────────────────────────────────── */}
      <div className="op-actions">
        <Button
          variant="primary"
          className="btn--cobalt btn--lg"
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
          {settleLabel}
        </Button>
        {myWonBet ? (
          <Button
            variant="primary"
            className="btn--cobalt btn--lg"
            leading={<Icon name="download" size={14} />}
            onClick={doClaim}
            disabled={claim.isPending || claim.isConfirming || !isSettled}
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
                  : `Claim +${(myWonBet.pnl ?? 0).toFixed(2)} OG`}
          </Button>
        ) : null}
        <Button
          className="btn--ghost btn--lg"
          leading={<Icon name="external" size={14} />}
          disabled={!effectiveVerdictTxHash}
          onClick={() => {
            if (!effectiveVerdictTxHash) return;
            const base = activeChain.blockExplorers?.default?.url;
            if (!base) return;
            window.open(
              `${base}/tx/${effectiveVerdictTxHash}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
          title={
            effectiveVerdictTxHash
              ? "Open the submitVerdict tx on 0G Explorer"
              : "Verdict tx not on-chain yet."
          }
        >
          Open on 0G Explorer
        </Button>
        <Button
          className="btn--ghost btn--lg"
          leading={<Icon name="alert" size={14} />}
          onClick={() => router.push(`/arenas/${battle.id}`)}
        >
          File dispute
        </Button>
        <Button
          className="btn--cobalt btn--lg"
          leading={<Icon name="sword" size={14} />}
          onClick={() => router.push(`/battle/new?opponent=${winner.id}`)}
        >
          Challenge {winner.name}
        </Button>
      </div>

      {/* ── Transcript + per-round mint mechanics ─────────────── */}
      <div id="match-transcript" style={{ marginTop: 28 }}>
        <MatchTranscript
          rounds={realRounds}
          fighterA={fighterA}
          fighterB={fighterB}
          stateAvailable={!!liveState}
        />
      </div>

      {MOMENT_INFT_ADDRESS !== "" && realRounds.length > 0 ? (
        <div id="mint-moments">
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
              Mint moments — per round
              <Badge tone="success">
                <Icon name="zap" size={10} />
                &nbsp;ERC-7857
              </Badge>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--op-ink-mid)",
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              Pin a round's argument as an INFT collectible. Each side gates
              to the fighter's owner. Default <b>2.5%</b> creator royalty
              under EIP-2981, tunable up to 10%.
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
        </div>
      ) : null}
    </PageContainer>
  );
}

function MatchTranscript({
  rounds,
  fighterA,
  fighterB,
  stateAvailable,
}: {
  rounds: import("@/lib/battle-state/types").BattleRound[];
  fighterA: Fighter;
  fighterB: Fighter;
  stateAvailable: boolean;
}) {
  const lastRoundNumber = rounds.length > 0 ? rounds[rounds.length - 1].number : 0;
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(lastRoundNumber > 0 ? [lastRoundNumber] : []),
  );

  const toggle = (n: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  if (!stateAvailable && rounds.length === 0) {
    return (
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          Match transcript
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--op-ink-mid)",
            lineHeight: 1.55,
          }}
        >
          Round-by-round transcript was archived after settle. The encrypted
          full match still lives on 0G Storage; verifiable via the verdict tx
          + each round's TEE attestation.
        </div>
      </Card>
    );
  }

  if (rounds.length === 0) {
    return (
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          Match transcript
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--op-ink-mid)",
            lineHeight: 1.55,
          }}
        >
          Loading rounds from 0G…
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 20, marginBottom: 16 }}>
      <div
        className="label"
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Match transcript
        <Split k="rounds" v={String(rounds.length)} size="sm" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rounds.map((round) => {
          const isOpen = expanded.has(round.number);
          const argA = round.argumentA.content || "";
          const argB = round.argumentB.content || "";
          const tokA = round.argumentA.tokenCount ?? 0;
          const tokB = round.argumentB.tokenCount ?? 0;
          return (
            <div
              key={round.number}
              style={{
                border: "1px solid var(--op-ink)",
                background: "var(--op-paper)",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(round.number)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: isOpen
                    ? "var(--op-paper-deep)"
                    : "var(--op-paper)",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--op-ink)",
                  fontFamily: "var(--op-fm)",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  fontSize: 11,
                }}
              >
                <span>Round {round.number}</span>
                <span>{tokA + tokB} tokens</span>
                <Icon
                  name={isOpen ? "chevronDown" : "chevronRight"}
                  size={14}
                />
              </button>
              {isOpen ? (
                <div
                  style={{
                    padding: "12px 14px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    background: "var(--op-paper)",
                    borderTop: "1px dashed var(--op-ink-mid)",
                  }}
                >
                  <RoundQuote
                    fighter={fighterA}
                    side="a"
                    content={argA}
                    tokens={tokA}
                  />
                  <RoundQuote
                    fighter={fighterB}
                    side="b"
                    content={argB}
                    tokens={tokB}
                  />
                  {round.commentary?.content ? (
                    <div
                      style={{
                        marginTop: 4,
                        padding: "10px 12px",
                        borderLeft: "3px solid var(--op-plum)",
                        background: "var(--op-paper-deep)",
                        fontFamily: "var(--op-fi)",
                        fontStyle: "italic",
                        fontSize: 14,
                        color: "var(--op-plum)",
                        lineHeight: 1.55,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--op-fm)",
                          fontStyle: "normal",
                          fontSize: 9,
                          color: "var(--op-cobalt)",
                          letterSpacing: 2,
                          textTransform: "uppercase",
                          marginRight: 8,
                        }}
                      >
                        Color
                      </span>
                      {round.commentary.content}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RoundQuote({
  fighter,
  side,
  content,
  tokens,
}: {
  fighter: Fighter;
  side: "a" | "b";
  content: string;
  tokens: number;
}) {
  const cornerColor =
    side === "a" ? "var(--op-cobalt)" : "var(--op-fluo)";
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Sigil seed={fighter.name} size={28} color={cornerColor} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{fighter.name}</span>
          <span
            style={{
              fontFamily: "var(--op-fm)",
              fontSize: 10,
              color: "var(--op-ink-mid)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {tokens} tok
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: content ? "var(--op-ink)" : "var(--op-ink-mid)",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content || "(no content captured)"}
        </div>
      </div>
    </div>
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
    battleIdNum !== null ? { battleId: battleIdNum, roundNo, side } : null;
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

  // Argument-content unused outside preview; battleId unused but kept to
  // preserve the call-site contract for future receipt-deep-link surface.
  void battleId;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 10,
        background: "var(--op-paper-deep)",
        border: "1px solid var(--op-ink)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--op-fm)",
          fontSize: 11,
          color: "var(--op-ink-mid)",
          flexShrink: 0,
          width: 56,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        R{roundNo} · {side.toUpperCase()}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: "var(--op-ink-soft)",
          lineHeight: 1.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={argumentContent}
      >
        <span style={{ color: "var(--op-ink)", fontWeight: 600 }}>
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
