"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "./icon";

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/**
 * Promoter modal — ink-800 ground, ink-500 border, sh-3 drop, 3px
 * crimson top stripe (the "broadcast banner" identifier). Anton-display
 * caps title, mono close X. Foot bar sits on a slightly darker ink-900
 * to read as the action footer.
 *
 * Motion (navigation vocab per MOTION.md): backdrop fades, panel
 * scales 0.97 → 1.0 over 180ms easeOut. No bounce, no overshoot —
 * "get out of the way fast".
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
}: ModalProps) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9000,
            padding: 20,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: width,
              background: "var(--yap-ink-800)",
              border: "1px solid var(--yap-ink-500)",
              borderRadius: 0,
              boxShadow: "var(--yap-sh-3)",
              position: "relative",
            }}
          >
            {/* 3px crimson banner — the Promoter modal identifier. */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 3,
                background: "var(--yap-crimson)",
              }}
            />
            {title && (
              <div
                style={{
                  padding: "18px 22px",
                  borderBottom: "1px solid var(--yap-ink-600)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--yap-font-display)",
                    fontWeight: 800,
                    fontSize: 22,
                    lineHeight: 1,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: "var(--yap-ink-50)",
                  }}
                >
                  {title}
                </div>
                <button
                  onClick={onClose}
                  style={{
                    color: "var(--yap-ink-300)",
                    display: "flex",
                    cursor: "pointer",
                  }}
                  aria-label="Close"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            )}
            <div
              style={{
                padding: 22,
                color: "var(--yap-ink-100)",
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              {children}
            </div>
            {footer && (
              <div
                style={{
                  padding: "16px 22px",
                  borderTop: "1px solid var(--yap-ink-600)",
                  background: "var(--yap-ink-900)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
