"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { RoundChoice } from "@/lib/battle-state/types";

const COUNTDOWN_MS = 5_000;
const TICK_MS = 100;

/**
 * 5-second stance picker shown to the owner of the fighter about to
 * speak. Two binary choices — ATTACK or BUILD — that bias the next-round
 * user prompt on the runner. Picking either fires a POST and immediately
 * closes the modal; the countdown auto-fires the `defaultPick` if the
 * user stalls past the deadline, so a passive viewer never blocks the
 * battle clock.
 *
 * Owner gating happens at the call site — see `arena-live.tsx`'s
 * iControl check before rendering this component. The server route
 * doesn't validate the wallet (same trust model as /react), so the
 * prompt must only mount when the controlling user is the active client.
 */
export function RoundInputPrompt({
  battleId,
  side,
  round,
  fighterName,
  defaultPick = "build",
  onSettled,
}: {
  battleId: string;
  side: "a" | "b";
  round: number;
  fighterName: string;
  defaultPick?: RoundChoice;
  onSettled?: (choice: RoundChoice) => void;
}) {
  const [submitting, setSubmitting] = useState<RoundChoice | null>(null);
  const [remaining, setRemaining] = useState(COUNTDOWN_MS);
  const settledRef = useRef(false);

  const submit = async (choice: RoundChoice) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setSubmitting(choice);
    try {
      await fetch(`/api/battle/${battleId}/round-input`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ round, side, choice }),
      });
    } catch {
      // Network blip → the runner will fall through to the default
      // stance after its own server-side wait window. No need to surface
      // an error toast: from the user's POV, the next round will simply
      // play with the prior round's tactical baseline.
    }
    onSettled?.(choice);
  };

  // Countdown driver. Independent ticker so the visible bar/clock stays
  // smooth even while `submit()` is in flight.
  useEffect(() => {
    if (settledRef.current) return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, COUNTDOWN_MS - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        if (!settledRef.current) {
          void submit(defaultPick);
        }
      }
    }, TICK_MS);
    return () => clearInterval(id);
    // submit captures stable refs (battleId/round/side don't change while
    // the prompt is mounted — it's keyed on round in the parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPick]);

  const seconds = (remaining / 1000).toFixed(1);
  const pct = (remaining / COUNTDOWN_MS) * 100;
  const accent = side === "a" ? "var(--fighter-a)" : "var(--fighter-b)";

  return (
    <div
      role="dialog"
      aria-label="Pick your round stance"
      style={{
        padding: 16,
        background: "var(--yap-ink-800)",
        border: `1px solid ${accent}`,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div>
          <div
            className="label"
            style={{ color: accent, marginBottom: 4 }}
          >
            Round {round} · Your call
          </div>
          <div style={{ fontSize: 14 }}>
            {fighterName} is about to speak.
          </div>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: remaining < 1500 ? "var(--danger)" : "var(--tx-primary)",
            minWidth: 56,
            textAlign: "right",
          }}
        >
          {seconds}s
        </div>
      </div>
      <div
        style={{
          height: 3,
          background: "var(--bd-subtle)",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: accent,
            transition: `width ${TICK_MS}ms linear`,
          }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Button
          variant="primary"
          disabled={submitting !== null}
          onClick={() => submit("attack")}
          leading={<Icon name="sword" size={14} />}
        >
          {submitting === "attack" ? "Sending…" : "ATTACK"}
        </Button>
        <Button
          disabled={submitting !== null}
          onClick={() => submit("build")}
          leading={<Icon name="shield" size={14} />}
        >
          {submitting === "build" ? "Sending…" : "BUILD"}
        </Button>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--tx-tertiary)",
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        ATTACK presses the opponent's weakest claim head-on. BUILD
        consolidates your case and stacks evidence. Default at timeout:{" "}
        <strong>{defaultPick.toUpperCase()}</strong>.
      </div>
    </div>
  );
}
