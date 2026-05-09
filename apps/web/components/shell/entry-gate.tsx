"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const SESSION_FLAG = "yap-entered";

/**
 * First-access branded entry — fires once per session. Subsequent
 * navigation stays instant (per MOTION.md "no default page-load
 * fade"). Reduced-motion users skip the choreography entirely.
 *
 * Renders a fixed-position overlay that the page content sits
 * underneath — once the overlay dismisses (auto after 800ms or on
 * any key/click), the existing RouteCrossfade fades the actual
 * page content into view as part of its first render.
 *
 * Sequence:
 *   0ms    overlay mounts, ink-950 ground, dim
 *   80ms   crimson glow ring scales in 0.6 → 1.0 (overshoot)
 *   140ms  YAP wordmark scales 0.7 → 1.1 → 1.0 (overshoot)
 *   400ms  glow fades, ring scales out
 *   600ms  wordmark settles, overlay starts fading
 *   800ms  overlay unmounts; sessionStorage flag set
 *
 * Dismissable — escapes the ceremony if the user is impatient.
 */
export function EntryGate() {
  const reduced = useReducedMotion();
  // null = checking; true = show overlay; false = don't render anything.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (reduced) {
      // Still mark the flag so a subsequent re-toggle of reduced-motion
      // doesn't re-trigger the gate this session.
      try {
        sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        // sessionStorage unavailable (rare — Safari private mode).
      }
      setShow(false);
      return;
    }
    let entered = false;
    try {
      entered = sessionStorage.getItem(SESSION_FLAG) === "1";
    } catch {
      // sessionStorage unavailable; treat as first-access. The gate
      // will still mark the flag on dismiss; if that also fails,
      // worst case the gate fires every navigation, which is mild
      // annoyance not breakage.
    }
    setShow(!entered);
  }, [reduced]);

  // Auto-dismiss + dismiss-on-interaction.
  useEffect(() => {
    if (!show) return;
    const dismiss = () => setShow(false);
    const t = setTimeout(dismiss, 800);
    const onKey = () => dismiss();
    const onClick = () => dismiss();
    window.addEventListener("keydown", onKey, { once: true });
    window.addEventListener("pointerdown", onClick, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [show]);

  // Mark the flag the moment we decide to dismiss — so a fast click
  // through a navigation doesn't accidentally re-fire on the next
  // route's mount (RouteCrossfade renders quickly).
  useEffect(() => {
    if (show === false) {
      try {
        sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        // ignore
      }
    }
  }, [show]);

  if (show !== true) return null;

  return (
    <AnimatePresence>
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
        {/* Crimson glow ring — pulses once + fades. */}
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
        {/* YAP wordmark slam. */}
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
          {/* Mark — square cream block with crimson tick corners,
            * matches the design-system wordmark composition. */}
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
        {/* Caption — settles in last, fades with the overlay. */}
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
    </AnimatePresence>
  );
}
