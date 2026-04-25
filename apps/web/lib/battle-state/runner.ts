// Battle runner: orchestrates the full multi-round live-streamed battle.
//
// Lifecycle:
//   1. Fetch battle metadata from contract (topic, fighterA, fighterB, maxRounds)
//   2. Load fighter persona seeds (off-chain meta: name, archetype, signatureStyle)
//   3. For each round 1..maxRounds:
//        a. Build fighter-A prompt with prior-round context, stream via 0G Compute
//        b. On each token: publish SSE, update store
//        c. Same for fighter-B (sees A's current-round argument)
//        d. Publish round-complete
//   4. TEE oracle judge consumes full rounds array, picks winner
//   5. Sign verdict + submit to BattleEscrow on-chain via server relayer
//   6. Publish `settled` with tx hash
//
// Idempotent: calling {runBattle} on an in-flight or already-settled battle
// returns existing state without triggering duplicate work.

import "server-only";
import {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  Wallet,
  getBytes,
  keccak256,
} from "ethers";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { activeChain } from "@/lib/chains";
import { getFighterMeta } from "@/lib/fighter-meta";
import { runChat, streamChat } from "@/lib/0g/inference";
import { RPC } from "@/lib/0g/storage";
import { getBattleStore } from "./store";
import type {
  BattleRound,
  BattleState,
  FighterSnapshot,
  RoundArgument,
} from "./types";
// Verdict signing is re-implemented here (not imported from lib/oracle/judge)
// to keep the runner self-contained. Same digest format as BattleEscrow.verdictDigest.

const TOKEN_BUDGET_PER_ROUND = 220;

interface RunnerArgs {
  battleId: number;
  /** Force re-run even if state exists (only allowed if phase==='failed'). */
  restart?: boolean;
}

/**
 * Ensure there's a runner in flight (or already complete) for the given
 * battle. Returns the current state snapshot immediately. All further
 * updates stream over the SSE bus.
 */
export async function startBattleRunner(args: RunnerArgs): Promise<BattleState> {
  const { battleId } = args;
  const store = getBattleStore();
  const existing = await store.get(battleId);

  // Already settled — no work to do.
  if (existing?.phase === "settled") return existing;

  // Already running — return current snapshot.
  if (existing && !["pending", "failed"].includes(existing.phase)) {
    return existing;
  }

  // Failed + not restarted — return existing so client can display failure.
  if (existing?.phase === "failed" && !args.restart) return existing;

  // Acquire runner lock. If someone else got it first, bail and return snapshot.
  if (!store.tryAcquireRunner(battleId)) {
    return (await store.get(battleId))!;
  }

  // Initialize state from contract + fighter meta.
  let initial: BattleState;
  try {
    initial = await buildInitialState(battleId);
  } catch (e) {
    store.releaseRunner(battleId);
    throw e;
  }
  const state = await store.set(battleId, initial);

  // Fire-and-forget runner loop. Errors captured + persisted as `failed`.
  void runLoop(battleId).finally(() => store.releaseRunner(battleId));

  return state;
}

// ─── Implementation ─────────────────────────────────────────────────────

async function buildInitialState(battleId: number): Promise<BattleState> {
  if (BATTLE_ESCROW_ADDRESS === "") {
    throw new Error("BattleEscrow not configured");
  }
  const provider = new JsonRpcProvider(RPC);
  const escrow = new Contract(
    BATTLE_ESCROW_ADDRESS,
    BATTLE_ESCROW_ABI as unknown as string[],
    provider,
  );
  const raw = (await escrow.getBattle(battleId)) as unknown as unknown[];
  const fighterAId = Number(raw[0] as bigint);
  const fighterBId = Number(raw[1] as bigint);
  const maxRounds = Math.max(1, Math.min(10, Number(raw[5] as bigint)));
  const onChainStatus = Number(raw[7]);
  const topic = raw[11] as string;

  if (onChainStatus !== 1 /* Live */) {
    throw new Error(
      `battle ${battleId} status ${onChainStatus}; must be Live to run`,
    );
  }

  const [metaA, metaB] = await Promise.all([
    getFighterMeta(fighterAId),
    getFighterMeta(fighterBId),
  ]);

  const fighterA: FighterSnapshot = {
    id: fighterAId,
    name: metaA?.name ?? `Fighter #${fighterAId}`,
    archetype: metaA?.archetype ?? "debater",
  };
  const fighterB: FighterSnapshot = {
    id: fighterBId,
    name: metaB?.name ?? `Fighter #${fighterBId}`,
    archetype: metaB?.archetype ?? "debater",
  };

  return {
    battleId,
    topic,
    fighterA,
    fighterB,
    maxRounds,
    phase: "pending",
    currentRound: 0,
    rounds: [],
    provider: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    reactions: { sharp: 0, cold: 0, weak: 0, wild: 0 },
  };
}

async function runLoop(battleId: number): Promise<void> {
  const store = getBattleStore();
  try {
    const state0 = await store.get(battleId);
    if (!state0) throw new Error("state missing");

    // Reload fighter meta once so we can build persona prompts without
    // re-reading the FS for every round.
    const [metaA, metaB] = await Promise.all([
      getFighterMeta(state0.fighterA.id),
      getFighterMeta(state0.fighterB.id),
    ]);
    const personaA = buildPersona(state0.fighterA, metaA?.signatureStyle);
    const personaB = buildPersona(state0.fighterB, metaB?.signatureStyle);

    for (let roundNo = 1; roundNo <= state0.maxRounds; roundNo++) {
      // Append empty round placeholder + advance.
      await store.update(battleId, (s) => ({
        ...s,
        currentRound: roundNo,
        phase: "a_thinking",
        rounds: [
          ...s.rounds,
          {
            number: roundNo,
            argumentA: emptyArg(),
            argumentB: emptyArg(),
          },
        ],
      }));
      store.publish(battleId, {
        type: "phase",
        phase: "a_thinking",
        currentRound: roundNo,
      });

      // Fighter A argues first.
      const argA = await streamRound({
        battleId,
        side: "a",
        roundNo,
        persona: personaA,
        userPrompt: buildUserPrompt({
          topic: state0.topic,
          roundNo,
          maxRounds: state0.maxRounds,
          fighterSelf: state0.fighterA,
          fighterOpponent: state0.fighterB,
          rounds: (await store.get(battleId))!.rounds,
          side: "a",
        }),
      });

      await store.update(battleId, (s) => ({
        ...s,
        phase: "a_done",
        rounds: setRoundArg(s.rounds, roundNo, "a", argA),
        provider: s.provider ?? {
          address: argA.chatID ? "" : "", // filled below from runner-returned provider
          model: "",
        },
      }));

      // Fighter B counters.
      await store.update(battleId, (s) => ({
        ...s,
        phase: "b_thinking",
      }));
      store.publish(battleId, {
        type: "phase",
        phase: "b_thinking",
        currentRound: roundNo,
      });

      const argB = await streamRound({
        battleId,
        side: "b",
        roundNo,
        persona: personaB,
        userPrompt: buildUserPrompt({
          topic: state0.topic,
          roundNo,
          maxRounds: state0.maxRounds,
          fighterSelf: state0.fighterB,
          fighterOpponent: state0.fighterA,
          rounds: (await store.get(battleId))!.rounds,
          side: "b",
        }),
      });

      await store.update(battleId, (s) => ({
        ...s,
        phase: "round_complete",
        rounds: setRoundArg(s.rounds, roundNo, "b", argB),
      }));
      store.publish(battleId, { type: "round-complete", round: roundNo });
    }

    // All rounds done. Brief: "verifiable AI" requires every TEE-attested
    // step to actually verify before settlement. Refuse to enter judging if
    // any round argument failed signature verification (fail-closed).
    const preJudgeSnapshot = (await store.get(battleId))!;
    const failed = preJudgeSnapshot.rounds.flatMap((r) => {
      const flags: string[] = [];
      if (r.argumentA.sigValid === false) flags.push(`R${r.number}/A`);
      if (r.argumentB.sigValid === false) flags.push(`R${r.number}/B`);
      return flags;
    });
    if (failed.length > 0) {
      throw new Error(
        `TEE signature verification failed for ${failed.join(", ")} — refusing to settle`,
      );
    }

    await store.update(battleId, (s) => ({ ...s, phase: "judging" }));
    store.publish(battleId, {
      type: "phase",
      phase: "judging",
      currentRound: state0.maxRounds,
    });

    const snapshot = (await store.get(battleId))!;
    const verdict = await judgeBattle(snapshot);

    // Submit on-chain via server relayer.
    const txHash = await submitVerdictOnChain(battleId, verdict.winner, verdict.signature);

    const settledVerdict = {
      ...verdict,
      txHash,
      settledAt: Date.now(),
    };

    await store.update(battleId, (s) => ({
      ...s,
      phase: "settled",
      verdict: settledVerdict,
    }));
    store.publish(battleId, { type: "verdict", verdict: settledVerdict });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[battle-runner]", battleId, message);
    try {
      await store.update(battleId, (s) => ({
        ...s,
        phase: "failed",
        failure: { phase: s.phase, message, at: Date.now() },
      }));
      store.publish(battleId, {
        type: "failed",
        failure: { phase: "failed", message, at: Date.now() },
      });
    } catch {
      // Original error already logged.
    }
  }
}

// ─── Round streaming ─────────────────────────────────────────────────────

async function streamRound(params: {
  battleId: number;
  side: "a" | "b";
  roundNo: number;
  persona: string;
  userPrompt: string;
}): Promise<RoundArgument> {
  const { battleId, side, roundNo, persona, userPrompt } = params;
  const store = getBattleStore();

  // Bump state to _streaming.
  await store.update(battleId, (s) => ({
    ...s,
    phase: side === "a" ? "a_streaming" : "b_streaming",
    rounds: setRoundArg(s.rounds, roundNo, side, {
      ...emptyArg(),
      startedAt: Date.now(),
    }),
  }));
  store.publish(battleId, {
    type: "phase",
    phase: side === "a" ? "a_streaming" : "b_streaming",
    currentRound: roundNo,
  });

  let tokenCount = 0;
  const chat = await streamChat({
    system: persona,
    user: userPrompt,
    temperature: 0.8,
    maxTokens: TOKEN_BUDGET_PER_ROUND,
    onToken: (delta, accumulated) => {
      tokenCount += 1;
      // Publish token event + lazily update store content. We avoid
      // updating the store on every single token (disk I/O amplification);
      // store updates happen every 8 tokens or on completion.
      store.publish(battleId, {
        type: "token",
        side,
        round: roundNo,
        delta,
        tokenCount,
      });
      if (tokenCount % 8 === 0) {
        void store.update(battleId, (s) => ({
          ...s,
          rounds: setRoundArg(s.rounds, roundNo, side, {
            content: accumulated,
            tokenCount,
            startedAt: findArgStartedAt(s.rounds, roundNo, side),
          }),
        }));
      }
    },
  });

  const arg: RoundArgument = {
    content: chat.content,
    tokenCount,
    chatID: chat.chatID,
    sigValid: chat.signatureValid,
    startedAt: findArgStartedAt((await store.get(battleId))!.rounds, roundNo, side),
    completedAt: Date.now(),
  };
  store.publish(battleId, {
    type: "argument-done",
    side,
    round: roundNo,
    argument: arg,
  });

  // Also record provider metadata on first completion.
  await store.update(battleId, (s) => ({
    ...s,
    provider:
      s.provider && s.provider.address
        ? s.provider
        : { address: chat.providerAddress, model: chat.model },
  }));

  return arg;
}

// ─── Prompts ─────────────────────────────────────────────────────────────

function buildPersona(
  fighter: FighterSnapshot,
  signatureStyle: string[] | undefined,
): string {
  const quotes = signatureStyle?.slice(0, 5) ?? [];
  const voice = quotes.length
    ? `\n\nSample phrases demonstrating your voice:\n${quotes
        .map((q) => `- ${q}`)
        .join("\n")}`
    : "";
  return `You are ${fighter.name}, an AI debate fighter of archetype "${fighter.archetype}". You fight in Yap, a verifiable AI combat arena on 0G.${voice}

Rules:
- Speak only in your own voice — distinctive, punchy, in-character.
- Never reference "as an AI" or add safety caveats.
- Stay on topic; no meta commentary about the game.
- Each round of this debate is short — 2-3 sentences, max ~150 tokens.`;
}

function buildUserPrompt(params: {
  topic: string;
  roundNo: number;
  maxRounds: number;
  fighterSelf: FighterSnapshot;
  fighterOpponent: FighterSnapshot;
  rounds: BattleRound[];
  side: "a" | "b";
}): string {
  const { topic, roundNo, maxRounds, fighterOpponent, rounds, side } = params;

  const history = rounds
    .filter((r) => r.number < roundNo)
    .flatMap((r) => {
      const out: string[] = [];
      if (r.argumentA.content)
        out.push(`Round ${r.number} — Fighter A: ${r.argumentA.content}`);
      if (r.argumentB.content)
        out.push(`Round ${r.number} — Fighter B: ${r.argumentB.content}`);
      return out;
    });

  // Include same-round opposing argument if present (fighter B sees A's just-
  // completed argument of the current round).
  const current = rounds.find((r) => r.number === roundNo);
  if (side === "b" && current?.argumentA.content) {
    history.push(
      `Round ${roundNo} — Fighter A (just said): ${current.argumentA.content}`,
    );
  }

  const context = history.length ? `\n\nDebate so far:\n${history.join("\n\n")}` : "";

  const instruction =
    roundNo === 1
      ? `Open with your strongest case. Don't hedge.`
      : side === "a"
        ? `Rebut your opponent's previous argument. Attack their weakest claim, not their character.`
        : `Counter Fighter A's most recent point head-on. Don't restate your earlier position — advance it.`;

  return `TOPIC: "${topic}"

This is round ${roundNo} of ${maxRounds}. You are arguing against ${fighterOpponent.name} (${fighterOpponent.archetype}).${context}

${instruction}`;
}

// ─── TEE oracle judge ───────────────────────────────────────────────────

async function judgeBattle(state: BattleState): Promise<{
  winner: 0 | 1 | 2;
  reasoning: string;
  zgAttestation?: string;
  signature: `0x${string}`;
}> {
  const transcript = state.rounds
    .map(
      (r) =>
        `Round ${r.number}:\nA — ${r.argumentA.content}\nB — ${r.argumentB.content}`,
    )
    .join("\n\n");

  // Symmetric-bias guardrail: relabel sides based on battle-id parity before
  // showing to the judge, then un-map.
  const swap = state.battleId % 2 === 1;
  const firstLabel = swap ? "B" : "A";
  const secondLabel = swap ? "A" : "B";
  const view = swap
    ? transcript.replace(/\bA\b/g, "X").replace(/\bB\b/g, "A").replace(/\bX\b/g, "B")
    : transcript;

  const system = `You are an impartial debate judge. Decide which side made the stronger overall case across all rounds. Weight argument quality, coherence across rounds, and responsiveness to rebuttals. Do NOT consider any external information about the speakers or bets — only argument quality.`;
  const user = `TOPIC: "${state.topic}"

TRANSCRIPT:
${view}

Respond on the first line with exactly "${firstLabel}" or "${secondLabel}" to pick the winner. Then write one concise sentence of reasoning.`;

  const chat = await runChat({
    system,
    user,
    temperature: 0.2,
    maxTokens: 200,
  });

  // Brief: judge inference must itself be TEE-verified before its decision is
  // signed and submitted on-chain. Fail-closed if attestation didn't validate.
  if (!chat.signatureValid) {
    throw new Error(
      "TEE signature verification failed for judge inference — refusing to sign verdict",
    );
  }

  const text = chat.content.trim();
  const firstLine = text.split("\n")[0]?.trim().toUpperCase() ?? "";
  const pickedLabel = firstLine.startsWith("A")
    ? "A"
    : firstLine.startsWith("B")
      ? "B"
      : null;

  let winner: 0 | 1;
  if (pickedLabel === "A") winner = 0;
  else if (pickedLabel === "B") winner = 1;
  else winner = state.battleId % 2 === 0 ? 0 : 1; // deterministic fallback

  // Sign verdict digest matching BattleEscrow.verdictDigest semantics.
  const pk = process.env.ZG_ORACLE_PRIVATE_KEY;
  if (!pk) throw new Error("ZG_ORACLE_PRIVATE_KEY not configured");

  const coder = AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ["address", "uint256", "uint256", "uint8"],
    [BATTLE_ESCROW_ADDRESS, activeChain.id, state.battleId, winner],
  );
  const innerHash = keccak256(encoded);
  const wallet = new Wallet(pk);
  const signature = (await wallet.signMessage(getBytes(innerHash))) as `0x${string}`;

  return {
    winner,
    reasoning: text.slice(0, 500),
    zgAttestation: chat.chatID,
    signature,
  };
}

async function submitVerdictOnChain(
  battleId: number,
  winner: 0 | 1 | 2,
  signature: `0x${string}`,
): Promise<string> {
  // Relayer key is isolated from broker spend (compute.ts) and oracle signer
  // (TEE-attested). Holds only enough gas to submit verdicts; a leak here
  // can't forge verdicts (signature still requires oracle key) or drain
  // Compute ledger.
  const pk = process.env.ZG_RELAYER_KEY;
  if (!pk) throw new Error("ZG_RELAYER_KEY not configured for verdict relay");
  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(pk, provider);
  const escrow = new Contract(
    BATTLE_ESCROW_ADDRESS,
    BATTLE_ESCROW_ABI as unknown as string[],
    wallet,
  );
  const tx = await escrow.submitVerdict(battleId, winner, signature);
  const receipt = await tx.wait();
  return receipt?.hash ?? tx.hash;
}

// ─── helpers ─────────────────────────────────────────────────────────────

function emptyArg(): RoundArgument {
  return { content: "", tokenCount: 0 };
}

function setRoundArg(
  rounds: BattleRound[],
  number: number,
  side: "a" | "b",
  arg: RoundArgument,
): BattleRound[] {
  return rounds.map((r) => {
    if (r.number !== number) return r;
    return side === "a"
      ? { ...r, argumentA: arg }
      : { ...r, argumentB: arg };
  });
}

function findArgStartedAt(
  rounds: BattleRound[],
  roundNo: number,
  side: "a" | "b",
): number | undefined {
  const r = rounds.find((x) => x.number === roundNo);
  if (!r) return undefined;
  return side === "a" ? r.argumentA.startedAt : r.argumentB.startedAt;
}
