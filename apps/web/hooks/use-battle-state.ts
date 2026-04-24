"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BattleEvent,
  BattleRound,
  BattleState,
  RoundArgument,
} from "@/lib/battle-state/types";

/**
 * Subscribes to the /api/battle/[id]/stream SSE endpoint. Keeps a local
 * BattleState mirror up to date from the event stream.
 *
 * On mount, kicks off an optional bootstrap fetch of /state so pages that
 * render before the first SSE snapshot lands see the current phase.
 *
 * Reconnection:
 *   - EventSource auto-reconnects on network drops.
 *   - If the server sends a `snapshot` event, we replace local state
 *     (catches up any missed events during disconnect).
 */
export function useBattleState(battleIdNum: number | null) {
  const [state, setState] = useState<BattleState | null>(null);
  const [connected, setConnected] = useState(false);
  const [spectators, setSpectators] = useState(0);
  const srcRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (battleIdNum === null || battleIdNum <= 0) return;
    let cancelled = false;

    // Bootstrap: fetch snapshot + current spectator count while SSE connects.
    fetch(`/api/battle/${battleIdNum}/state`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { state: BattleState | null; spectators: number } | null) => {
        if (cancelled || !body) return;
        if (body.state) setState(body.state);
        if (typeof body.spectators === "number") setSpectators(body.spectators);
      })
      .catch(() => {});

    const src = new EventSource(`/api/battle/${battleIdNum}/stream`);
    srcRef.current = src;

    src.onopen = () => {
      if (!cancelled) setConnected(true);
    };
    src.onerror = () => {
      if (!cancelled) setConnected(false);
    };
    src.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as BattleEvent;
        if (event.type === "spectators") {
          setSpectators(event.count);
          return;
        }
        setState((prev) => applyEvent(prev, event));
      } catch {
        // ignore malformed frame
      }
    };

    return () => {
      cancelled = true;
      src.close();
      srcRef.current = null;
    };
  }, [battleIdNum]);

  return { state, connected, spectators };
}

// ─── Reducer ─────────────────────────────────────────────────────────────

function applyEvent(
  prev: BattleState | null,
  event: BattleEvent,
): BattleState | null {
  switch (event.type) {
    case "snapshot":
      return event.state;

    case "phase":
      if (!prev) return prev;
      return {
        ...prev,
        phase: event.phase,
        currentRound: event.currentRound,
        updatedAt: Date.now(),
      };

    case "token": {
      if (!prev) return prev;
      const rounds = ensureRound(prev.rounds, event.round);
      return {
        ...prev,
        rounds: rounds.map((r) => {
          if (r.number !== event.round) return r;
          const side = event.side === "a" ? "argumentA" : "argumentB";
          const arg = r[side];
          const nextArg: RoundArgument = {
            ...arg,
            content: (arg.content ?? "") + event.delta,
            tokenCount: event.tokenCount,
            startedAt: arg.startedAt ?? Date.now(),
          };
          return { ...r, [side]: nextArg };
        }),
        updatedAt: Date.now(),
      };
    }

    case "argument-done": {
      if (!prev) return prev;
      const rounds = ensureRound(prev.rounds, event.round);
      return {
        ...prev,
        rounds: rounds.map((r) => {
          if (r.number !== event.round) return r;
          const side = event.side === "a" ? "argumentA" : "argumentB";
          return { ...r, [side]: event.argument };
        }),
        updatedAt: Date.now(),
      };
    }

    case "round-complete":
      if (!prev) return prev;
      return { ...prev, currentRound: event.round, updatedAt: Date.now() };

    case "verdict":
      if (!prev) return prev;
      return {
        ...prev,
        phase: "settled",
        verdict: event.verdict,
        updatedAt: Date.now(),
      };

    case "failed":
      if (!prev) return prev;
      return {
        ...prev,
        phase: "failed",
        failure: event.failure,
        updatedAt: Date.now(),
      };

    case "spectators":
      // Handled at the hook level (separate spectators state); return prev
      // unchanged so BattleState isn't affected by viewer-count churn.
      return prev;

    case "reaction":
      if (!prev) return prev;
      return {
        ...prev,
        reactions: {
          ...(prev.reactions ?? { sharp: 0, cold: 0, weak: 0, wild: 0 }),
          [event.key]: event.count,
        },
        updatedAt: Date.now(),
      };
  }
}

function ensureRound(rounds: BattleRound[], number: number): BattleRound[] {
  if (rounds.some((r) => r.number === number)) return rounds;
  return [
    ...rounds,
    {
      number,
      argumentA: { content: "", tokenCount: 0 },
      argumentB: { content: "", tokenCount: 0 },
    },
  ];
}
