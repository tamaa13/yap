"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Sigil } from "@/components/ui/sigil";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageContainer } from "@/components/shell/page-container";
import { GateScreen } from "@/components/wallet/gate-screen";
import { useCreateBattle } from "@/hooks/use-create-battle";
import { useFighters } from "@/hooks/use-fighters";
import { useWallet } from "@/hooks/use-wallet";

const TOPIC_SUGGESTIONS = [
  "Is pineapple pizza a crime against humanity?",
  "Should smart contracts ever be upgradeable?",
  "Does proof of work still have a future?",
  "Is attention the new scarce resource?",
  "Are memecoins a cultural phenomenon or a scam?",
  "Should AI agents hold private keys?",
];

export default function BattleNewPage() {
  const router = useRouter();
  const { push } = useToast();
  const { ready, connected, addr } = useWallet();
  const create = useCreateBattle();
  const [step, setStep] = useState(1);
  const [mine, setMine] = useState<number | null>(null);
  const [opponent, setOpponent] = useState<number | null>(null);
  const [topic, setTopic] = useState(TOPIC_SUGGESTIONS[0]);
  const [stakeInput, setStakeInput] = useState("1");
  const [roundsCount, setRoundsCount] = useState(3);

  const myFighters = useFighters({ owner: addr, limit: 32 });
  const allFighters = useFighters({ limit: 64 });

  const myList = myFighters.data;
  const opponents = useMemo(
    () => allFighters.data.filter((f) => !myList.some((m) => m.id === f.id)),
    [allFighters.data, myList],
  );

  if (ready && !connected) {
    return <GateScreen action="the battle setup" icon="sword" />;
  }

  const stepLabels = ["1 Fighter", "2 Opponent", "3 Topic", "4 Stake", "5 Review"];
  const chosenMine = myList.find((f) => f.id === mine);
  const chosenOpp = opponents.find((f) => f.id === opponent);

  const startBattle = async () => {
    if (mine == null || opponent == null || !topic.trim()) return;
    try {
      const stakeNum = Number(stakeInput);
      if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
        push({ kind: "error", text: "Stake must be greater than 0." });
        return;
      }
      await create.write({
        fighterA: mine,
        fighterB: opponent,
        topic: topic.trim(),
        maxRounds: roundsCount,
        stakeEth: stakeInput,
      });
      push({
        kind: "success",
        text: "Challenge sent · waiting for defender to accept",
      });
      // Route to Vault → Challenges (outgoing tab) so the challenger sees
      // their pending challenge listed with an expiry countdown. Going to
      // the arena page before the challenge is accepted would show a
      // "pending" state which is now also available there, but the Vault
      // is the more natural home for managing your own challenges.
      setTimeout(() => router.push("/vault?tab=challenges"), 800);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Create failed",
      });
    }
  };

  return (
    <PageContainer maxWidth={880}>
      <Breadcrumbs
        items={[{ label: "Arenas", to: "/arenas" }, { label: "Create battle" }]}
      />
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Create battle</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {stepLabels.map((l, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: step >= i + 1 ? "var(--bg-surface)" : "var(--bg-sunken)",
              border: `1px solid ${step === i + 1 ? "var(--accent-border)" : "var(--bd-default)"}`,
              borderRadius: 4,
              fontSize: 12,
              color: step >= i + 1 ? "var(--tx-primary)" : "var(--tx-tertiary)",
            }}
          >
            {l}
          </div>
        ))}
      </div>

      <Card style={{ padding: 20 }}>
        {step === 1 && (
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Pick your fighter</div>
            {myList.length === 0 ? (
              <EmptyState
                icon="user"
                title="You don't own a fighter yet"
                body="Mint one to enter the arena."
                cta={
                  <Button variant="primary" onClick={() => router.push("/mint")}>
                    Mint fighter
                  </Button>
                }
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 10,
                }}
              >
                {myList.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setMine(f.id)}
                    style={{
                      padding: 14,
                      textAlign: "left",
                      background: mine === f.id ? "var(--accent-muted)" : "var(--bg-sunken)",
                      border: `1px solid ${mine === f.id ? "var(--accent-border)" : "var(--bd-default)"}`,
                      borderRadius: 4,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <Sigil seed={f.name} size={40} color={f.color} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                      <div className="num" style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>
                        ELO {f.elo}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Challengeable opponents</div>
            {opponents.length === 0 ? (
              <EmptyState
                icon="users"
                title="No opponents yet"
                body="Wait for someone else to mint, or challenge yourself later."
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 10,
                }}
              >
                {opponents.slice(0, 12).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setOpponent(f.id)}
                    style={{
                      padding: 14,
                      textAlign: "left",
                      background: opponent === f.id ? "var(--accent-muted)" : "var(--bg-sunken)",
                      border: `1px solid ${opponent === f.id ? "var(--accent-border)" : "var(--bd-default)"}`,
                      borderRadius: 4,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <Sigil seed={f.name} size={40} color={f.color} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                      <div className="num" style={{ fontSize: 11, color: "var(--tx-tertiary)" }}>
                        ELO {f.elo}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Topic</div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginBottom: 12,
              }}
            >
              {TOPIC_SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  style={{
                    padding: "12px 14px",
                    textAlign: "left",
                    background: topic === t ? "var(--accent-muted)" : "var(--bg-sunken)",
                    border: `1px solid ${topic === t ? "var(--accent-border)" : "var(--bd-default)"}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: "var(--tx-primary)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <Input
              placeholder="Or write a custom topic…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
        )}

        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div className="label" style={{ marginBottom: 12 }}>
                Your stake (bet on your own fighter)
              </div>
              <Input
                type="number"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                trailing={<span className="label">0G</span>}
                min={0}
                step="0.01"
              />
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tx-tertiary)",
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Locked into BattleEscrow when you create the challenge. The
                defender must match at least <strong>75%</strong> of this amount
                to accept — prevents zero-stake free-option plays. If the
                challenge is declined or expires, you can claim a full refund
                from the Vault. Winners receive up to <strong>5× their stake</strong>;
                any surplus beyond the cap is refunded pro-rata to the losing side.
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 10 }}>
                Debate length
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[1, 3, 5, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRoundsCount(n)}
                    style={{
                      padding: "10px 18px",
                      background:
                        roundsCount === n ? "var(--accent-muted)" : "var(--bg-sunken)",
                      border: `1px solid ${roundsCount === n ? "var(--accent-border)" : "var(--bd-default)"}`,
                      borderRadius: 4,
                      color: roundsCount === n ? "var(--accent)" : "var(--tx-primary)",
                      fontSize: 13,
                      fontFamily: "var(--mono)",
                      cursor: "pointer",
                    }}
                  >
                    {n} round{n === 1 ? "" : "s"}
                  </button>
                ))}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tx-tertiary)",
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Each round = both fighters argue once (2× inference calls per
                round on 0G Compute). Judge reviews all rounds before verdict.
                Longer debates are more dramatic but cost more compute.
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Review</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Your fighter</span>
                <span>{chosenMine?.name ?? "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Opponent</span>
                <span>{chosenOpp?.name ?? "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Topic</span>
                <span style={{ maxWidth: 400, textAlign: "right" }}>{topic}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Debate length</span>
                <span className="num">{roundsCount} round{roundsCount === 1 ? "" : "s"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--tx-secondary)" }}>Your stake</span>
                <span className="num">{stakeInput} 0G</span>
              </div>
            </div>
            {create.error && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  background: "rgba(232,107,107,0.08)",
                  border: "1px solid rgba(232,107,107,0.30)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "var(--tx-primary)",
                  wordBreak: "break-word",
                }}
              >
                {create.error.message}
              </div>
            )}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <Button onClick={() => (step > 1 ? setStep(step - 1) : router.push("/arenas"))}>
          {step > 1 ? "Back" : "Cancel"}
        </Button>
        {step < 5 ? (
          <Button
            variant="primary"
            disabled={(step === 1 && mine == null) || (step === 2 && opponent == null)}
            onClick={() => setStep(step + 1)}
            trailing={<Icon name="arrowRight" size={14} />}
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={startBattle}
            disabled={create.isPending || create.isConfirming || mine == null || opponent == null}
          >
            {create.isPending
              ? "Confirm in wallet…"
              : create.isConfirming
                ? "Confirming…"
                : "Start battle"}
          </Button>
        )}
      </div>
    </PageContainer>
  );
}
