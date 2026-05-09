"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useReadContract } from "wagmi";
import {
  BATTLE_ESCROW_ABI,
  BATTLE_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { useBattles } from "@/hooks/use-battles";
import { useLeaderboard } from "@/hooks/use-leaderboard";

const SESSION_FLAG = "yap-entered";
const HARD_TIMEOUT_MS = 3000; // never trap the user behind a dead RPC
const MIN_GATE_MS = 600; // logo slam visual minimum — never cut earlier
const POST_READY_GRACE_MS = 200; // breathing room after data ready

type Phase = "checking" | "gating" | "done";

/**
 * First-access branded entry — fires once per session. Render-driven:
 * the splash holds open until the critical app-wide data hooks settle
 * (useLeaderboard champion + useBattles live + nextBattleId), THEN
 * dismisses. Pre-warms TanStack Query so the underlying landing
 * surfaces (LandingHeroStats, LandingTopFighters, LandingLiveBoard)
 * mount with cache hits — no skeleton-flicker through the dismiss
 * handoff.
 *
 * Phase machine:
 *   checking → gating → done
 *
 *   checking — renders nothing (one render before sessionStorage
 *     useEffect lands).
 *   gating   — splash overlay shown; data hooks fetching. Once
 *     dataReady (or 3s hard timeout), waits LOGO_SETTLE_MS to let
 *     the logo slam complete its visual beat, then transitions to
 *     done.
 *   done     — children render; sessionStorage flag set.
 *
 * Subsequent navigation reads the flag, jumps straight to done. No
 * splash, no waiting.
 *
 * Reduced-motion: skip choreography entirely, mark flag, render
 * children immediately.
 *
 * Dismissable: any keydown / pointerdown jumps the phase to done.
 */
export function EntryGate({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("checking");

  // Hydration check — sessionStorage flag determines whether the gate
  // has anything to do this session.
  useEffect(() => {
    if (reduced) {
      markEntered();
      setPhase("done");
      return;
    }
    let entered = false;
    try {
      entered = sessionStorage.getItem(SESSION_FLAG) === "1";
    } catch {
      // sessionStorage unavailable (Safari private). Treat as
      // first-access; if write also fails the gate fires every
      // navigation — annoying, not breakage.
    }
    setPhase(entered ? "done" : "gating");
  }, [reduced]);

  // ── Data-readiness signals ─────────────────────────────────────
  // These hooks fire while the splash is up so the cache is warm
  // by the time children mount. They don't decide whether to render
  // the splash — they decide WHEN to dismiss it.
  const { isLoading: leaderboardLoading } = useLeaderboard({
    metric: "elo",
    limit: 1,
  });
  const { isLoading: battlesLoading } = useBattles({
    status: "live",
    limit: 3,
  });
  const nextBattleQuery = useReadContract({
    address:
      BATTLE_ESCROW_ADDRESS !== ""
        ? (BATTLE_ESCROW_ADDRESS as `0x${string}`)
        : undefined,
    abi: BATTLE_ESCROW_ABI,
    functionName: "nextBattleId",
    query: { enabled: BATTLE_ESCROW_ADDRESS !== "" },
  });
  const dataReady =
    !leaderboardLoading && !battlesLoading && !nextBattleQuery.isLoading;

  // ── Hard timeout ──────────────────────────────────────────────
  // If RPC is dead or slow, never trap the user behind the splash
  // longer than HARD_TIMEOUT_MS.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (phase !== "gating") return;
    const t = setTimeout(() => setTimedOut(true), HARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Transition to done ───────────────────────────────────────
  // Triggered by either dataReady OR timedOut. Two-stage timing:
  //  1. Hold the splash for at least MIN_GATE_MS so the logo slam
  //     completes its visual beat — fast data shouldn't make the
  //     splash blink.
  //  2. Once trigger AND minimum elapsed, wait POST_READY_GRACE_MS
  //     so the LandingHeroStats / TopFighters cache hits paint
  //     under the splash before it lifts.
  const gatingStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase === "gating" && gatingStartRef.current === null) {
      gatingStartRef.current = Date.now();
    }
  }, [phase]);
  const settleStartedRef = useRef(false);
  useEffect(() => {
    if (phase !== "gating") return;
    if (settleStartedRef.current) return;
    if (!dataReady && !timedOut) return;
    settleStartedRef.current = true;
    const elapsed =
      gatingStartRef.current !== null
        ? Date.now() - gatingStartRef.current
        : 0;
    const remaining = Math.max(0, MIN_GATE_MS - elapsed);
    const t = setTimeout(
      () => {
        markEntered();
        setPhase("done");
      },
      remaining + POST_READY_GRACE_MS,
    );
    return () => clearTimeout(t);
  }, [phase, dataReady, timedOut]);

  // ── Skip-on-interaction ──────────────────────────────────────
  // Any keypress or pointer click jumps to done immediately.
  useEffect(() => {
    if (phase !== "gating") return;
    const dismiss = () => {
      markEntered();
      setPhase("done");
    };
    window.addEventListener("keydown", dismiss, { once: true });
    window.addEventListener("pointerdown", dismiss, { once: true });
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [phase]);

  // ── Render ──────────────────────────────────────────────────
  // `done`: hand off entirely.
  // `checking`: the brief one-render window before the hydration
  //   useEffect lands. Render children pre-emptively — if the user
  //   has visited before (the common case), this avoids a flash of
  //   "nothing" between SSR and hydration.
  if (phase === "done" || phase === "checking") {
    return (
      <>
        {children}
        {/* Block interaction with the children during checking so a
         * fast click doesn't fire on a half-mounted state. The
         * splash overlay (next branch) covers this in the gating
         * phase — but in checking we don't render the splash, so
         * just rely on the next render to swap. */}
      </>
    );
  }

  return (
    <>
      {/* Children mount underneath the splash so their data hooks
       * fire alongside ours — no extra round trip when the splash
       * dismisses. The overlay covers them visually. */}
      <div aria-hidden style={{ visibility: "hidden" }}>
        {children}
      </div>
      <AnimatePresence>
        <Splash />
      </AnimatePresence>
    </>
  );
}

function markEntered() {
  try {
    sessionStorage.setItem(SESSION_FLAG, "1");
  } catch {
    // ignore
  }
}

function Splash() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      // Above route content but below toast stack (toast z-index 9500).
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9400,
        background: "var(--yap-ink-950)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
      }}
      aria-hidden
    >
      {/* Crimson glow ring — pulses once + fades. Brand impact, finite. */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{
          scale: [0.6, 1.15, 1.4],
          opacity: [0, 0.45, 0],
        }}
        transition={{
          duration: 0.65,
          delay: 0.08,
          times: [0, 0.4, 1],
          ease: [0.32, 0.72, 0, 1],
        }}
        style={{
          position: "absolute",
          width: 220,
          height: 220,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, rgba(200,16,46,0.6) 0%, rgba(200,16,46,0.18) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* YAP wordmark slam — overshoot ease, combat vocab. */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{
          scale: [0.7, 1.1, 1.0],
          opacity: [0, 1, 1],
        }}
        transition={{
          duration: 0.45,
          delay: 0.14,
          times: [0, 0.6, 1],
          ease: [0.34, 1.56, 0.64, 1],
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          position: "relative",
        }}
      >
        {/* Mark — cream outline + crimson tick corners per design system. */}
        <span
          style={{
            position: "relative",
            width: 56,
            height: 56,
            border: "2px solid var(--yap-ink-50)",
            display: "grid",
            placeItems: "center",
            background: "var(--yap-ink-950)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--yap-font-display)",
              fontSize: 38,
              lineHeight: 1,
              color: "var(--yap-ink-50)",
            }}
          >
            Y
          </span>
          <span
            style={{
              position: "absolute",
              top: -3,
              left: -3,
              width: 7,
              height: 7,
              background: "var(--yap-crimson)",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: -3,
              right: -3,
              width: 7,
              height: 7,
              background: "var(--yap-crimson)",
            }}
          />
        </span>
        <span
          style={{
            fontFamily: "var(--yap-font-display)",
            fontSize: 64,
            lineHeight: 1,
            color: "var(--yap-ink-50)",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Yap
        </span>
      </motion.div>
      {/* Caption — fades in last; reads as a fight-card eyebrow. */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.5, ease: [0.32, 0.72, 0, 1] }}
        style={{
          position: "absolute",
          bottom: 56,
          fontFamily: "var(--yap-font-mono)",
          fontSize: 11,
          letterSpacing: 3,
          color: "var(--yap-gold)",
          textTransform: "uppercase",
        }}
      >
        ━━ Verifiable combat
      </motion.div>
    </motion.div>
  );
}
