// Canonical type definitions for multi-round live battles.
// State is owned by the server (lib/battle-state/store.ts). Clients receive
// snapshots via GET /state and push updates via SSE on /stream.

export type BattlePhase =
  | "pending"
  | "a_thinking"
  | "a_streaming"
  | "a_done"
  | "b_thinking"
  | "b_streaming"
  | "b_done"
  | "round_complete"
  | "judging"
  | "settled"
  | "failed";

export interface FighterSnapshot {
  id: number;
  name: string;
  archetype: string;
  /** On-chain reputation stats threaded into the judge prompt as a
   *  soft prior. HP tracks win rate, Logic tracks ELO, Wit tracks
   *  battles fought — see `lib/on-chain.ts` for derivation. The judge
   *  is told these are reputation hints, not damage values, so the
   *  outcome is still argument-driven. */
  hp?: number;
  logic?: number;
  wit?: number;
  /** Style tags derived from the fighter's seed (e.g. "punchy",
   *  "logical", "chaotic"). Threaded into the per-round persona prompt
   *  as personality cues — same tags shown on the fighter card. */
  tags?: string[];
}

export interface RoundArgument {
  /** Final content once streaming completes. During streaming this is the
   *  partial accumulation. */
  content: string;
  /** Monotonic counter of tokens emitted so far. Useful for client UIs to
   *  detect "is the model still typing?" without diffing content. */
  tokenCount: number;
  chatID?: string;
  sigValid?: boolean;
  startedAt?: number;
  completedAt?: number;
}

export interface RoundCommentary {
  /** Streaming-accumulated commentary text. */
  content: string;
  tokenCount: number;
  startedAt?: number;
  completedAt?: number;
  /** True once the commentator stream finished cleanly. False/undefined while
   *  in flight or if the commentator was disabled / failed. */
  done?: boolean;
}

export interface BattleRound {
  number: number; // 1-indexed
  argumentA: RoundArgument;
  argumentB: RoundArgument;
  /** Optional ESPN-style live commentary on this round. Decorative only —
   *  not TEE-signed, doesn't affect the verdict. Absent when the
   *  ZG_COMMENTATOR_ENABLED gate is off or the side-call failed. */
  commentary?: RoundCommentary;
}

export interface Verdict {
  winner: 0 | 1 | 2;
  reasoning: string;
  zgAttestation?: string;
  signature?: `0x${string}`;
  txHash?: string;
  settledAt: number;
}

export interface BattleFailure {
  phase: BattlePhase;
  message: string;
  at: number;
}

/** Fixed reaction vocabulary. Clients render buttons in this order. */
export const REACTION_KEYS = ["sharp", "cold", "weak", "wild"] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];

export interface BattleState {
  battleId: number;
  topic: string;
  fighterA: FighterSnapshot;
  fighterB: FighterSnapshot;
  maxRounds: number;
  phase: BattlePhase;
  /** 1-indexed. 0 means not started. */
  currentRound: number;
  rounds: BattleRound[];
  verdict?: Verdict;
  provider: { address: string; model: string } | null;
  startedAt: number;
  updatedAt: number;
  failure?: BattleFailure;
  /** Anonymous reaction counters keyed by {ReactionKey}. */
  reactions: Record<ReactionKey, number>;
}

// ─── SSE events ─────────────────────────────────────────────────────────

export type BattleEvent =
  | { type: "snapshot"; state: BattleState }
  | { type: "phase"; phase: BattlePhase; currentRound: number }
  | {
      type: "token";
      side: "a" | "b";
      round: number;
      delta: string;
      tokenCount: number;
    }
  | {
      type: "argument-done";
      side: "a" | "b";
      round: number;
      argument: RoundArgument;
    }
  | { type: "round-complete"; round: number }
  | {
      type: "commentator-token";
      round: number;
      delta: string;
      tokenCount: number;
    }
  | { type: "commentator-done"; round: number; commentary: RoundCommentary }
  | { type: "verdict"; verdict: Verdict }
  | { type: "failed"; failure: BattleFailure }
  | { type: "spectators"; count: number }
  | { type: "reaction"; key: ReactionKey; count: number };
