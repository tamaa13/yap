"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { LiveDot } from "@/components/ui/live-dot";
import { NumberInput } from "@/components/ui/number-input";
import { useWallet, useWalletGate } from "@/hooks/use-wallet";
import { fmtNum } from "@/lib/format";
import type { Battle, Fighter } from "@/lib/types";

export interface BetLock {
  side: "a" | "b";
  amount: number;
  odds: number;
}

export function BetBar({
  battle,
  fighterA,
  fighterB,
  onLock,
}: {
  battle: Battle;
  fighterA: Fighter;
  fighterB: Fighter;
  onLock: (bet: BetLock) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState(0.5);
  const [side, setSide] = useState<"a" | "b">("a");
  const { connected } = useWallet();
  const gate = useWalletGate();

  // Betting window only open while the battle is live. Past battles
  // (settled / verdict reached) and upcoming (pending challenge accept)
  // both close the book on the bet escrow — the contract reverts and
  // surfacing a disabled CTA is the kinder path than a failed tx.
  const isBettingOpen = battle.status === "live";

  const odds = side === "a" ? battle.oddsA : battle.oddsB;
  const potential = (+amount * odds).toFixed(2);
  const profit = (+potential - +amount).toFixed(2);

  const openBetPanel = (preSide?: "a" | "b") => {
    if (preSide) setSide(preSide);
    if (!isBettingOpen) return;
    gate(`Bet on ${battle.id}`, () => setExpanded(true));
  };
  const tryLock = () => {
    // Defense-in-depth: NumberInput bounds the input visually (min 0.01,
    // max 100), but a manually-typed 0 or NaN would still reach here.
    // Reverts on-chain regardless (BattleEscrow rejects 0-value bets),
    // but failing client-side is the kinder path.
    const amt = +amount;
    if (!Number.isFinite(amt) || amt < 0.01 || amt > 100) {
      return;
    }
    gate(
      `Lock ${amt} 0G on ${side === "a" ? fighterA.name : fighterB.name}`,
      () => onLock({ side, amount: amt, odds }),
    );
  };

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 10,
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--bd-strong)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
      }}
    >
      {!expanded && (
        <div
          className="al-betbar-rail"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 20px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LiveDot />
            <span className="label" style={{ color: "var(--live)" }}>Open bets</span>
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--tx-tertiary)",
            }}
          >
            Pool <span style={{ color: "var(--tx-primary)" }}>{fmtNum(battle.pool)}</span> 0G
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "stretch", gap: 6, flexWrap: "wrap" }}>
            {([
              ["a", fighterA, battle.oddsA] as const,
              ["b", fighterB, battle.oddsB] as const,
            ]).map(([s, f, o]) => (
              <button
                key={s}
                onClick={() => openBetPanel(s)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  height: 36,
                  background: s === "a" ? "var(--fighter-a-bg)" : "var(--fighter-b-bg)",
                  border: `1px solid ${s === "a" ? "var(--fighter-a-bd)" : "var(--fighter-b-bd)"}`,
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: s === "a" ? "var(--fighter-a)" : "var(--fighter-b)",
                  }}
                >
                  {f.name}
                </span>
                <span
                  className="num"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--tx-primary)" }}
                >
                  {o.toFixed(2)}×
                </span>
              </button>
            ))}
            <Button
              variant="primary"
              size="md"
              onClick={() => openBetPanel()}
              disabled={!isBettingOpen}
              trailing={<Icon name="arrowRight" size={12} />}
              leading={!connected ? <Icon name="wallet" size={12} /> : undefined}
              title={
                !isBettingOpen
                  ? battle.status === "past"
                    ? "Book closed — battle settled."
                    : "Book opens when the bell rings."
                  : undefined
              }
            >
              {!isBettingOpen
                ? battle.status === "past"
                  ? "Book closed"
                  : "Book opens at bell"
                : connected
                  ? "Place bet"
                  : "Connect to bet"}
            </Button>
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ padding: "16px 20px", maxWidth: 1280, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LiveDot />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Place bet</span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--tx-tertiary)",
                }}
              >
                Pool {fmtNum(battle.pool)} 0G
              </span>
            </div>
            <button onClick={() => setExpanded(false)} style={{ color: "var(--tx-tertiary)", padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </div>

          <div
            className="al-betbar-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: 16,
              alignItems: "end",
            }}
          >
            <Field label="Side">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {([
                  ["a", fighterA, battle.oddsA] as const,
                  ["b", fighterB, battle.oddsB] as const,
                ]).map(([s, f, o]) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    style={{
                      padding: "8px 10px",
                      textAlign: "left",
                      background: side === s ? "var(--accent-muted)" : "var(--bg-sunken)",
                      border: `1px solid ${side === s ? "var(--accent-border)" : "var(--bd-default)"}`,
                      borderRadius: 4,
                      transition: "all 150ms ease-out",
                      height: 52,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--tx-secondary)",
                        marginBottom: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {f.name}
                    </div>
                    <div
                      className="num"
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: side === s ? "var(--accent)" : "var(--tx-primary)",
                      }}
                    >
                      {o.toFixed(2)}×
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Amount" hint="min 0.01 · max 100">
              <NumberInput
                value={amount}
                onChange={(v) => setAmount(v)}
                min={0.01}
                max={100}
                step={0.1}
                suffix="0G"
              />
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                {[0.1, 0.5, 1, 5, 10].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      height: 22,
                      background: "var(--bg-sunken)",
                      border: "1px solid var(--bd-default)",
                      borderRadius: 3,
                      color: "var(--tx-secondary)",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Potential payout">
              <div
                style={{
                  padding: "10px 12px",
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--bd-subtle)",
                  borderRadius: 4,
                  height: 52,
                }}
              >
                <div
                  className="num"
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--accent)",
                    lineHeight: 1.1,
                  }}
                >
                  {potential} 0G
                </div>
                <div
                  className="num"
                  style={{ fontSize: 11, color: "var(--tx-secondary)", marginTop: 2 }}
                >
                  +{profit} 0G profit
                </div>
              </div>
            </Field>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Button variant="primary" size="lg" onClick={tryLock}>
                Lock bet
              </Button>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--tx-tertiary)",
                  textAlign: "center",
                  fontFamily: "var(--mono)",
                }}
              >
                Escrow on 0G
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
