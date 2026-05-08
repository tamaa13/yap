"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { LiveDot } from "@/components/ui/live-dot";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { TxSteps, type TxStep } from "@/components/ui/tx-steps";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { usePlaceBet } from "@/hooks/use-place-bet";
import { useBattleState } from "@/hooks/use-battle-state";
import type {
  BattleRound,
  BattleState as LiveBattleState,
  RoundArgument,
} from "@/lib/battle-state/types";
import type { ArgumentLine as ArgumentLineType, Battle, Fighter } from "@/lib/types";
import { ArgumentLine } from "./argument-line";
import { BetBar, type BetLock } from "./bet-bar";
import { FighterPanel } from "./fighter-panel";

function parseBattleIdNum(uiId: string): number | null {
  const m = uiId.match(/^b-([0-9a-fA-F]+)$/);
  if (!m) return null;
  try {
    return Number(BigInt(`0x${m[1]}`));
  } catch {
    return null;
  }
}

export function ArenaLive({
  battle,
  fighterA,
  fighterB,
  scriptedArgs,
}: {
  battle: Battle;
  fighterA: Fighter;
  fighterB: Fighter;
  scriptedArgs: ArgumentLineType[];
}) {
  const fighters = { a: fighterA, b: fighterB };
  const battleIdNum = parseBattleIdNum(battle.id);
  const {
    state: liveState,
    connected: sseConnected,
    spectators,
  } = useBattleState(battleIdNum);

  const [args, setArgs] = useState(scriptedArgs.slice(0, 5));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingBet, setPendingBet] = useState<BetLock | null>(null);
  const { push } = useToast();
  const logRef = useRef<HTMLDivElement | null>(null);
  const placeBet = usePlaceBet();

  useEffect(() => {
    const remaining = scriptedArgs.slice(args.length);
    if (remaining.length === 0) return;
    const t = setTimeout(() => setArgs((a) => [...a, remaining[0]]), 6000);
    return () => clearTimeout(t);
  }, [args, scriptedArgs]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [args]);

  const handleLock = (bet: BetLock) => {
    setPendingBet(bet);
    setConfirmOpen(true);
    placeBet.reset();
  };

  const confirmBet = async () => {
    if (!pendingBet) return;
    try {
      await placeBet.write({
        battleId: battle.id,
        side: pendingBet.side,
        amountOG: pendingBet.amount,
      });
      // tx is submitted; isConfirming flips, eventually isSuccess.
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Bet didn't land",
      });
    }
  };

  // Dismiss the modal + toast success once the receipt lands.
  useEffect(() => {
    if (!placeBet.isSuccess || !pendingBet) return;
    const fighterName = pendingBet.side === "a" ? fighterA.name : fighterB.name;
    push({
      kind: "success",
      text: `${pendingBet.amount} 0G on ${fighterName}. Skin in the game.`,
    });
    const id = setTimeout(() => {
      setConfirmOpen(false);
      placeBet.reset();
      setPendingBet(null);
    }, 900);
    return () => clearTimeout(id);
  }, [placeBet.isSuccess, pendingBet, fighterA.name, fighterB.name, push, placeBet]);

  const phase: "idle" | "signing" | "confirming" | "done" | "error" = placeBet.error
    ? "error"
    : placeBet.isSuccess
      ? "done"
      : placeBet.isConfirming
        ? "confirming"
        : placeBet.isPending
          ? "signing"
          : "idle";

  const txSteps: TxStep[] = [
    {
      label: "Sign transaction in wallet",
      status:
        phase === "signing"
          ? "active"
          : phase === "confirming" || phase === "done"
            ? "done"
            : phase === "error" && !placeBet.hash
              ? "error"
              : "pending",
    },
    {
      label: "Broadcast to 0G Chain",
      status:
        phase === "confirming"
          ? "active"
          : phase === "done"
            ? "done"
            : "pending",
      hint: placeBet.hash ? `${placeBet.hash.slice(0, 10)}…` : undefined,
    },
    {
      label: "Block confirmation",
      status: phase === "done" ? "done" : phase === "confirming" ? "active" : "pending",
      hint: placeBet.receipt?.blockNumber
        ? `block ${placeBet.receipt.blockNumber.toString()}`
        : undefined,
    },
    {
      label: "Bet locked in escrow",
      status: phase === "done" ? "done" : "pending",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 52px)" }}>
      <div
        className="al-arena-status"
        style={{
          borderBottom: "1px solid var(--bd-default)",
          display: "flex",
          alignItems: "center",
          padding: "10px 20px",
          gap: 16,
          background: "var(--bg-surface)",
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <Breadcrumbs
            items={[
              { label: "Arenas", to: "/arenas" },
              { label: "Live", to: "/arenas" },
              { label: battle.id },
            ]}
          />
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--mono)",
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          <LiveDot />
          <span style={{ color: "var(--live)", letterSpacing: 0.1 }}>LIVE</span>
          <span style={{ color: "var(--tx-tertiary)", marginLeft: 8 }}>{battle.id}</span>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--tx-primary)", flexShrink: 0 }}>
          {liveState
            ? `Round ${Math.max(1, liveState.currentRound)} / ${liveState.maxRounds} · ${phaseLabel(liveState.phase)}`
            : "Ready — click Run battle"}
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--tx-secondary)",
            flexShrink: 0,
          }}
        >
          <span className="num">{spectators.toLocaleString()}</span>{" "}
          <span style={{ color: "var(--tx-tertiary)" }}>watching</span>
          {sseConnected && (
            <span style={{ marginLeft: 6, color: "var(--success)" }}>· live</span>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          <RunBattleButton
            battleId={battle.id}
            phase={liveState?.phase ?? "pending"}
          />
        </div>
        <div style={{ flexShrink: 0 }}>
          <Badge mono tone="success">
            <Icon name="shield" size={10} />
            &nbsp;TEE
          </Badge>
        </div>
      </div>

      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--bd-subtle)",
          background: "var(--bg-canvas)",
          flexShrink: 0,
        }}
      >
        <div className="label" style={{ marginBottom: 6 }}>Topic</div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--tx-primary)",
            lineHeight: 1.35,
          }}
        >
          {battle.topic}
        </div>
      </div>

      <div
        className="al-arena-3col"
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "300px 1fr 300px",
          gap: 1,
          background: "var(--bd-default)",
          minHeight: 0,
        }}
      >
        <div
          className="al-arena-left"
          style={{ background: "var(--bg-canvas)", padding: 16, overflowY: "auto" }}
        >
          <FighterPanel fighter={fighterA} corner="a" />
        </div>

        <div
          className="al-arena-center"
          style={{ background: "var(--bg-canvas)", display: "flex", flexDirection: "column", minWidth: 0 }}
        >
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "8px 8px 8px 0" }}>
            {liveState && liveState.rounds.length > 0 ? (
              <LiveTranscript
                state={liveState}
                fighterA={fighterA}
                fighterB={fighterB}
                logRef={logRef}
              />
            ) : (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: "var(--tx-tertiary)",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                <div style={{ color: "var(--tx-primary)", marginBottom: 4, fontSize: 14 }}>
                  Ready for combat.
                </div>
                Click <strong style={{ color: "var(--tx-primary)" }}>Run battle</strong> in the top bar.
                <br />
                Fighters will debate across {battle.maxRound} rounds on 0G Compute,
                streaming live to everyone watching. The TEE judge picks a winner +
                signs a verdict that settles on-chain.
              </div>
            )}
            {args.length > 0 && liveState === null && (
              <>
                {args.map((arg, i) => (
                  <ArgumentLine
                    key={i}
                    arg={arg}
                    fighters={fighters}
                    isLatest={i === args.length - 1}
                    typing={
                      i === args.length - 1 && args.length > 1 && arg.speaker !== "judge"
                    }
                  />
                ))}
              </>
            )}
          </div>
          <ReactionsBar battleId={battle.id} state={liveState} />
        </div>

        <div
          className="al-arena-right"
          style={{ background: "var(--bg-canvas)", padding: 16, overflowY: "auto" }}
        >
          <FighterPanel fighter={fighterB} corner="b" />
        </div>
      </div>

      <BetBar battle={battle} fighterA={fighterA} fighterB={fighterB} onLock={handleLock} />

      <Modal
        open={confirmOpen}
        onClose={() => phase === "idle" && setConfirmOpen(false)}
        title={
          phase === "idle"
            ? "Confirm bet"
            : phase === "done"
              ? "Bet confirmed"
              : phase === "error"
                ? "Bet failed"
                : "Processing bet"
        }
        footer={
          phase === "idle" || phase === "error" ? (
            <>
              <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={confirmBet}>
                {phase === "error" ? "Retry" : "Sign & lock"}
              </Button>
            </>
          ) : null
        }
      >
        {pendingBet && phase === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--tx-secondary)" }}>Battle</span>
              <span className="mono">{battle.id}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--tx-secondary)" }}>Side</span>
              <span>{pendingBet.side === "a" ? fighterA.name : fighterB.name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--tx-secondary)" }}>Amount</span>
              <span className="num">{(+pendingBet.amount).toFixed(2)} 0G</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--tx-secondary)" }}>Odds</span>
              <span className="num">{pendingBet.odds.toFixed(2)}×</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 10,
                borderTop: "1px solid var(--bd-subtle)",
              }}
            >
              <span style={{ color: "var(--tx-secondary)" }}>Potential payout</span>
              <span className="num" style={{ color: "var(--accent)", fontWeight: 600 }}>
                {(+pendingBet.amount * pendingBet.odds).toFixed(2)} 0G
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--tx-tertiary)", marginTop: 4 }}>
              Funds escrow until battle resolves with TEE attestation.
            </div>
          </div>
        )}
        {pendingBet && phase !== "idle" && (
          <>
            <TxSteps steps={txSteps} />
            {placeBet.error && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: "rgba(232,107,107,0.08)",
                  border: "1px solid rgba(232,107,107,0.30)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "var(--tx-primary)",
                  wordBreak: "break-word",
                }}
              >
                {placeBet.error.message}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/**
 * Anyone watching a live battle can request the TEE oracle to judge and
 * relay the verdict on-chain. The oracle's signature validates against
 * BattleEscrow.oracleKey regardless of who calls submitVerdict — relay is
 * permissionless. Button hits /api/oracle/judge?relay=1 which:
 *   1. Runs the pool-blinded judge (in TEE for production)
 *   2. Signs the verdict with the oracle key
 *   3. Submits on-chain via a server-side relayer
 */
function RunBattleButton({
  battleId,
  phase,
}: {
  battleId: string;
  phase: LiveBattleState["phase"];
}) {
  const { push } = useToast();
  const [starting, setStarting] = useState(false);

  const parse = (id: string): number | null => {
    const m = id.match(/^b-([0-9a-fA-F]+)$/);
    if (!m) return null;
    try {
      return Number(BigInt(`0x${m[1]}`));
    } catch {
      return null;
    }
  };

  const onClick = async () => {
    const bid = parse(battleId);
    if (bid === null) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/battle/${bid}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restart: phase === "failed" }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `Start failed (${res.status})`);
      }
      push({
        kind: "default",
        text: "Bell's ringing. Battle's live on 0G Compute below.",
      });
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't start the battle",
      });
    } finally {
      setStarting(false);
    }
  };

  // Button is only actionable before a run starts or after a failure.
  const isRunning =
    phase !== "pending" && phase !== "settled" && phase !== "failed";
  const isSettled = phase === "settled";
  const isFailed = phase === "failed";
  const disabled = starting || isRunning || isSettled;

  const label = starting
    ? "Ringing the bell…"
    : isSettled
      ? "Battle settled"
      : isFailed
        ? "Run it back"
        : isRunning
          ? phaseLabel(phase)
          : "Ring the bell";

  return (
    <Button size="sm" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}

function phaseLabel(phase: LiveBattleState["phase"]): string {
  switch (phase) {
    case "pending":
      return "Ready";
    case "a_thinking":
      return "A preparing…";
    case "a_streaming":
      return "A arguing";
    case "a_done":
      return "A done";
    case "b_thinking":
      return "B preparing…";
    case "b_streaming":
      return "B countering";
    case "b_done":
      return "B done";
    case "round_complete":
      return "Next round…";
    case "judging":
      return "TEE judge deciding";
    case "settled":
      return "Settled";
    case "failed":
      return "Failed";
  }
}

function LiveTranscript({
  state,
  fighterA,
  fighterB,
  logRef,
}: {
  state: LiveBattleState;
  fighterA: Fighter;
  fighterB: Fighter;
  logRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Auto-scroll when new content arrives. Using updatedAt ensures scroll
  // on every mutation (including token deltas).
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.updatedAt, logRef]);

  const sortedRounds = [...state.rounds].sort((a, b) => a.number - b.number);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 16px 16px" }}>
      <ProviderStrip state={state} />

      {sortedRounds.map((round) => (
        <RoundView
          key={round.number}
          round={round}
          fighterA={fighterA}
          fighterB={fighterB}
          liveSide={
            state.currentRound === round.number
              ? state.phase === "a_streaming" || state.phase === "a_thinking"
                ? "a"
                : state.phase === "b_streaming" || state.phase === "b_thinking"
                  ? "b"
                  : null
              : null
          }
        />
      ))}

      {state.phase === "judging" && (
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
          <Badge mono tone="success">
            <Icon name="shield" size={10} />
            &nbsp;TEE judge deliberating
          </Badge>
          <div style={{ marginTop: 6 }}>
            Reviewing all rounds via pool-blinded 0G Compute inference. Verdict incoming.
          </div>
        </div>
      )}

      {state.verdict && (
        <div
          style={{
            padding: 14,
            background: "var(--bg-sunken)",
            borderLeft: "2px solid var(--accent)",
            borderRadius: 3,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Badge mono tone="success">
              <Icon name="shield" size={10} />
              &nbsp;TEE VERDICT
            </Badge>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent)",
              }}
            >
              {state.verdict.winner === 2
                ? "Draw"
                : state.verdict.winner === 0
                  ? `${fighterA.name} wins`
                  : `${fighterB.name} wins`}
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--tx-primary)",
              lineHeight: 1.55,
              marginBottom: 8,
            }}
          >
            {state.verdict.reasoning}
          </div>
          {state.verdict.txHash && (
            <div style={{ fontSize: 11, color: "var(--tx-tertiary)", fontFamily: "var(--mono)" }}>
              on-chain: {state.verdict.txHash.slice(0, 14)}…{state.verdict.txHash.slice(-6)}
            </div>
          )}
        </div>
      )}

      {state.phase === "failed" && state.failure && (
        <div
          style={{
            padding: 14,
            background: "rgba(232,107,107,0.08)",
            border: "1px solid rgba(232,107,107,0.30)",
            borderRadius: 3,
            fontSize: 13,
            color: "var(--tx-primary)",
          }}
        >
          <Badge tone="danger">Battle failed</Badge>
          <div style={{ marginTop: 6 }}>{state.failure.message}</div>
          <div style={{ fontSize: 11, color: "var(--tx-tertiary)", marginTop: 4 }}>
            Click &quot;Retry battle&quot; above to re-run.
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderStrip({ state }: { state: LiveBattleState }) {
  if (!state.provider) {
    return (
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          fontSize: 11,
          color: "var(--tx-tertiary)",
          fontFamily: "var(--mono)",
        }}
      >
        <Badge mono tone="success">
          <Icon name="shield" size={10} />
          &nbsp;0G Compute · TEE
        </Badge>
        <span>acquiring provider…</span>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        fontSize: 11,
        color: "var(--tx-tertiary)",
        fontFamily: "var(--mono)",
        flexWrap: "wrap",
      }}
    >
      <Badge mono tone="success">
        <Icon name="shield" size={10} />
        &nbsp;0G Compute · TEE
      </Badge>
      <span>{state.provider.model}</span>
      <span>·</span>
      <span>provider {state.provider.address.slice(0, 8)}…{state.provider.address.slice(-4)}</span>
    </div>
  );
}

function RoundView({
  round,
  fighterA,
  fighterB,
  liveSide,
}: {
  round: BattleRound;
  fighterA: Fighter;
  fighterB: Fighter;
  liveSide: "a" | "b" | null;
}) {
  return (
    <div
      style={{
        padding: 12,
        background: "var(--bg-surface)",
        border: "1px solid var(--bd-subtle)",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--tx-tertiary)",
          fontFamily: "var(--mono)",
          letterSpacing: 0.08,
          textTransform: "uppercase",
        }}
      >
        Round {round.number}
      </div>
      <ArgumentBubble
        label={`${fighterA.name}`}
        accent="var(--fighter-a)"
        arg={round.argumentA}
        streaming={liveSide === "a"}
      />
      <ArgumentBubble
        label={`${fighterB.name}`}
        accent="var(--fighter-b)"
        arg={round.argumentB}
        streaming={liveSide === "b"}
        alignRight
      />
    </div>
  );
}

function ArgumentBubble({
  label,
  accent,
  arg,
  alignRight,
  streaming,
}: {
  label: string;
  accent: string;
  arg: RoundArgument;
  alignRight?: boolean;
  streaming?: boolean;
}) {
  const hasContent = arg.content.length > 0;
  const sigState =
    arg.sigValid === true ? "valid" : arg.sigValid === false ? "invalid" : "pending";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: alignRight ? "flex-end" : "flex-start",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 11,
          fontFamily: "var(--mono)",
          color: "var(--tx-tertiary)",
          flexDirection: alignRight ? "row-reverse" : "row",
        }}
      >
        <span style={{ color: accent, fontWeight: 600 }}>{label}</span>
        {streaming && (
          <Badge mono tone="warning">
            typing…
          </Badge>
        )}
        {!streaming && hasContent && (
          <Badge mono tone={sigState === "valid" ? "success" : "warning"}>
            {sigState === "valid"
              ? "sig ✓"
              : sigState === "invalid"
                ? "sig ✗"
                : "sig ?"}
          </Badge>
        )}
        {arg.chatID && (
          <span title={arg.chatID}>chat {arg.chatID.slice(0, 12)}…</span>
        )}
      </div>
      <div
        style={{
          maxWidth: "82%",
          padding: hasContent ? 12 : 8,
          background: "var(--bg-sunken)",
          borderLeft: alignRight ? undefined : `2px solid ${accent}`,
          borderRight: alignRight ? `2px solid ${accent}` : undefined,
          borderRadius: 3,
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--tx-primary)",
          whiteSpace: "pre-wrap",
          minHeight: 32,
        }}
      >
        {hasContent ? arg.content : streaming ? "…" : "(waiting)"}
        {streaming && hasContent && <span className="al-caret" style={{ marginLeft: 2 }}></span>}
      </div>
    </div>
  );
}

const REACTION_LABELS = {
  sharp: "Sharp",
  cold: "Cold",
  weak: "Weak",
  wild: "Wild",
} as const;

function ReactionsBar({
  battleId,
  state,
}: {
  battleId: string;
  state: LiveBattleState | null;
}) {
  const reactions = state?.reactions ?? { sharp: 0, cold: 0, weak: 0, wild: 0 };
  const [pending, setPending] = useState<string | null>(null);

  const bid = (() => {
    const m = battleId.match(/^b-([0-9a-fA-F]+)$/);
    if (!m) return null;
    try {
      return Number(BigInt(`0x${m[1]}`));
    } catch {
      return null;
    }
  })();

  const disabled = state === null || state.phase === "pending" || bid === null;

  const react = async (key: keyof typeof REACTION_LABELS) => {
    if (bid === null) return;
    setPending(key);
    try {
      await fetch(`/api/battle/${bid}/react`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
    } catch {
      // Silent fail — reactions are cosmetic.
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      style={{
        borderTop: "1px solid var(--bd-subtle)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: "var(--bg-canvas)",
        flexWrap: "wrap",
      }}
    >
      <span className="label">Reactions</span>
      {(Object.entries(REACTION_LABELS) as [keyof typeof REACTION_LABELS, string][]).map(
        ([key, label]) => (
          <div
            key={key}
            style={{
              display: "flex",
              gap: 4,
              alignItems: "center",
              fontSize: 12,
              color: "var(--tx-secondary)",
            }}
          >
            <button
              onClick={() => react(key)}
              disabled={disabled || pending === key}
              style={{
                padding: "3px 8px",
                background:
                  pending === key
                    ? "var(--accent-muted)"
                    : "var(--bg-sunken)",
                border: `1px solid ${
                  pending === key ? "var(--accent-border)" : "var(--bd-default)"
                }`,
                borderRadius: 3,
                fontSize: 11,
                color: disabled ? "var(--tx-tertiary)" : "var(--tx-primary)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {label}
            </button>
            <span
              className="num"
              style={{ fontSize: 11, color: "var(--tx-tertiary)" }}
            >
              {reactions[key] ?? 0}
            </span>
          </div>
        ),
      )}
    </div>
  );
}
