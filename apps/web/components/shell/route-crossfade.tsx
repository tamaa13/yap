"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Subtle route crossfade for content beneath the persistent nav.
 *
 * Per MOTION.md: route fade-in on initial mount is forbidden ("default
 * opacity-0 page entry"). This wrapper only fades on subsequent route
 * changes — `firstRender` ref tracks the initial mount and skips the
 * `initial` animation that turn so the user doesn't see a fade on
 * cold-load.
 *
 * Crossfade is OPACITY ONLY (0.85 → 1, 180ms snap easing) — no scale,
 * no slide. Keeps the user's spatial anchor; reads as "same place,
 * different content" rather than "navigating into a new app screen".
 *
 * Reduced-motion: identity passthrough (no AnimatePresence at all).
 */
export function RouteCrossfade({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const reduced = useReducedMotion();
  const firstRender = useRef(true);

  useEffect(() => {
    firstRender.current = false;
  }, []);

  if (reduced) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={firstRender.current ? false : { opacity: 0.85 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0.85 }}
        transition={{
          duration: 0.18,
          ease: [0.32, 0.72, 0, 1],
        }}
        // contents preserves the layout flow — no extra div takes
        // box space, no scrollable container collapse during the fade.
        style={{ display: "contents" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
