"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { usePublicClient } from "wagmi";

// Step-internal pagination size for the opponent picker. Smaller than
// the global card-grid 24 so it stays inside the wizard card without
// pushing the Next button below the fold. 4×3 grid at desktop width.
const OPPONENT_PAGE_SIZE = 12;

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
  const [stance, setStance] = useState<"pro" | "con" | null>(null);
  const [stakeInput, setStakeInput] = useState("1");
  const [roundsCount, setRoundsCount] = useState(3);

  const publicClient = usePublicClient();
  const myFighters = useFighters({ owner: addr, limit: 200 });
  const allFighters = useFighters({ limit: 200 });

  const myList = myFighters.data;

  const opponentsLoading = allFighters.isLoading || myFighters.isLoading;

  const opponents = useMemo(() => {
    if (!addr || opponentsLoading) return [];
    const myAddr = addr.toLowerCase();
    const myIdSet = new Set(myFighters.data.map((f) => f.id));
    return allFighters.data.filter(
      (f) =>
        !myIdSet.has(f.id) &&
        f.owner.toLowerCase() !== myAddr &&
        (!f.rentedBy || f.rentedBy.toLowerCase() !== myAddr),
    );
  }, [allFighters.data, myFighters.data, addr, opponentsLoading]);

  // Local-state opponent pagination — wizard already owns the URL via
  // ?fighter & ?opponent, so paging stays in component state to avoid
  // tangling step-internal navigation with the wizard's own deep links.
  const [opponentPage, setOpponentPage] = useState(1);
  const opponentTotalPages = Math.max(
    1,
    Math.ceil(opponents.length / OPPONENT_PAGE_SIZE),
  );
  // Snap back to a valid page if the underlying list shrinks (e.g.,
  // search filter, or a fighter selected & removed from the pool).
  useEffect(() => {
    if (opponentPage > opponentTotalPages) setOpponentPage(opponentTotalPages);
  }, [opponentPage, opponentTotalPages]);
  const opponentOffset = (opponentPage - 1) * OPPONENT_PAGE_SIZE;
  const opponentsVisible = opponents.slice(
    opponentOffset,
    opponentOffset + OPPONENT_PAGE_SIZE,
  );

  if (ready && !connected) {
    return <GateScreen action="the battle setup" icon="sword" />;
  }

  const stepLabels = ["1 Fighter", "2 Opponent", "3 Topic", "4 Stance", "5 Stake", "6 Review"];
  const chosenMine = myList.find((f) => f.id === mine);
  const chosenOpp = opponents.find((f) => f.id === opponent);

  const startBattle = async () => {
    if (mine == null || opponent == null || !topic.trim() || !stance) return;
    try {
      const stakeNum = Number(stakeInput);
      if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
        push({ kind: "error", text: "Stake has to be more than zero." });
        return;
      }
      const txHash = await create.write({
        fighterA: mine,
        fighterB: opponent,
        topic: topic.trim(),
        maxRounds: roundsCount,
        stakeEth: stakeInput,
      });
      // Parse battleId from BattleCreated event and save stance best-effort.
      if (txHash && publicClient) {
        try {
          const { parseEventLogs } = await import("viem");
          const { BATTLE_ESCROW_ABI } = await import("@/lib/contracts");
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
          const logs = parseEventLogs({
            abi: BATTLE_ESCROW_ABI,
            logs: receipt.logs,
            eventName: "BattleCreated",
          });
          if (logs.length > 0) {
            const battleId = Number((logs[0].args as { battleId: bigint }).battleId);
            await fetch(`/api/battle/${battleId}/stance`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ side: stance }),
            });
          }
        } catch {
          // stance save is best-effort; battle still proceeds
        }
      }
      push({ kind: "success", text: "Challenge thrown. Defender's on the clock." });
      setTimeout(() => router.push("/vault?tab=challenges"), 800);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't create the battle",
      });
    }
  };

  return (
    <PageContainer maxWidth={880}>
      <Breadcrumbs
        items={[{ label: "Arenas", to: "/arenas" }, { label: "Create battle" }]}
      />
      <h1
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 400,
          fontSize: 56,
          lineHeight: 0.9,
          letterSpacing: "-0.5px",
          textTransform: "uppercase",
          marginBottom: 20,
          color: "var(--yap-ink-50)",
        }}
      >
        Create battle
      </h1>

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
                title="No fighter, no fight"
                body="Mint one and meet me in the ring."
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
            {opponentsLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--tx-tertiary)", fontSize: 13 }}>
                Loading fighters…
              </div>
            ) : opponents.length === 0 ? (
              <EmptyState
                icon="users"
                title="Nobody to fight. Yet."
                body="Hang tight while others mint, or come back and self-battle."
              />
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 10,
                  }}
                >
                  {opponentsVisible.map((f) => (
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
                {opponents.length > OPPONENT_PAGE_SIZE && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "12px 0 0",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        letterSpacing: 1.5,
                        color: "var(--yap-ink-300)",
                        textTransform: "uppercase",
                      }}
                    >
                      Page{" "}
                      <span style={{ color: "var(--yap-ink-50)" }}>
                        {String(opponentPage).padStart(2, "0")}
                      </span>{" "}
                      / {String(opponentTotalPages).padStart(2, "0")}
                      <span style={{ marginLeft: 12, color: "var(--yap-ink-400)" }}>
                        {opponentOffset + 1}–
                        {Math.min(
                          opponents.length,
                          opponentOffset + OPPONENT_PAGE_SIZE,
                        )}{" "}
                        of {opponents.length} fighters
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        leading={<Icon name="chevronLeft" size={12} />}
                        onClick={() => setOpponentPage((p) => Math.max(1, p - 1))}
                        disabled={opponentPage <= 1}
                      >
                        Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        trailing={<Icon name="chevronRight" size={12} />}
                        onClick={() =>
                          setOpponentPage((p) =>
                            Math.min(opponentTotalPages, p + 1),
                          )
                        }
                        disabled={opponentPage >= opponentTotalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
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
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Your stance on this topic</div>
            <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
              Your fighter will argue this position every round. The opponent is locked into the opposite side — no same-stance battles.
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {(["pro", "con"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStance(s)}
                  style={{
                    flex: 1,
                    padding: "20px 14px",
                    textAlign: "center",
                    background: stance === s ? "var(--accent-muted)" : "var(--bg-sunken)",
                    border: `1px solid ${stance === s ? "var(--accent-border)" : "var(--bd-default)"}`,
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 700, color: stance === s ? "var(--accent)" : "var(--tx-primary)", marginBottom: 4 }}>
                    {s === "pro" ? "PRO" : "CON"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tx-tertiary)" }}>
                    {s === "pro" ? "Argue in favour of the topic" : "Argue against the topic"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
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

        {step === 6 && (
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
                <span style={{ color: "var(--tx-secondary)" }}>Your stance</span>
                <span style={{ fontWeight: 600, color: stance === "pro" ? "var(--success)" : "var(--danger)" }}>
                  {stance?.toUpperCase() ?? "—"} · Opponent: {stance === "pro" ? "CON" : stance === "con" ? "PRO" : "—"}
                </span>
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
        {step < 6 ? (
          <Button
            variant="primary"
            disabled={
              (step === 1 && mine == null) ||
              (step === 2 && opponent == null) ||
              (step === 4 && stance == null)
            }
            onClick={() => setStep(step + 1)}
            trailing={<Icon name="arrowRight" size={14} />}
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={startBattle}
            disabled={create.isPending || create.isConfirming || mine == null || opponent == null || !stance}
          >
            {create.isPending
              ? "Sign in your wallet…"
              : create.isConfirming
                ? "Throwing the challenge…"
                : "Throw down"}
          </Button>
        )}
      </div>
    </PageContainer>
  );
}
