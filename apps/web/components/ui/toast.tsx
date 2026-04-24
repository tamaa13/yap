"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
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
          gap: 8,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 14px",
              background: "var(--bg-raised)",
              border: `1px solid ${t.kind === "error" ? "rgba(232,107,107,0.40)" : "var(--bd-strong)"}`,
              borderRadius: 4,
              minWidth: 260,
              maxWidth: 360,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            {t.kind === "error" ? (
              <Icon name="alert" size={16} style={{ color: "var(--danger)" }} />
            ) : t.kind === "success" ? (
              <Icon name="check" size={16} style={{ color: "var(--success)" }} />
            ) : (
              <Icon name="dot" size={10} style={{ color: "var(--accent)" }} />
            )}
            <div style={{ flex: 1 }}>{t.text}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
