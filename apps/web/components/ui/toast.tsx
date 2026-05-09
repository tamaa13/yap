"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./icon";

export type ToastKind = "default" | "success" | "error";
export interface Toast {
  id: string;
  text: string;
  kind?: ToastKind;
}

interface ToastContextValue {
  push: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ push: () => {} });

const KIND_BORDER: Record<ToastKind, string> = {
  default: "var(--yap-info)",
  success: "var(--yap-success)",
  error: "var(--yap-danger)",
};

const KIND_ICON: Record<
  ToastKind,
  { name: "alert" | "check" | "dot"; size: number; color: string }
> = {
  default: { name: "dot", size: 10, color: "var(--yap-info)" },
  success: { name: "check", size: 16, color: "var(--yap-success)" },
  error: { name: "alert", size: 16, color: "var(--yap-danger)" },
};

/**
 * Promoter toast — ink-800 ground, ink-500 border, 4px left accent
 * stripe color-coded per kind. Slide in from the right edge per
 * MOTION.md navigation vocab; 240ms snap easing, no bounce.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, ...t }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 9500,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 460,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const kind = t.kind ?? "default";
            const icon = KIND_ICON[kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ x: "120%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "120%", opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                style={{
                  padding: "14px 16px 14px 14px",
                  background: "var(--yap-ink-800)",
                  border: "1px solid var(--yap-ink-500)",
                  borderLeft: `4px solid ${KIND_BORDER[kind]}`,
                  borderRadius: 0,
                  minWidth: 280,
                  maxWidth: 460,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  boxShadow: "var(--yap-sh-2)",
                  pointerEvents: "auto",
                }}
              >
                <Icon
                  name={icon.name}
                  size={icon.size}
                  style={{ color: icon.color, marginTop: 1 }}
                />
                <div
                  style={{
                    flex: 1,
                    color: "var(--yap-ink-100)",
                    lineHeight: 1.45,
                  }}
                >
                  {t.text}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
