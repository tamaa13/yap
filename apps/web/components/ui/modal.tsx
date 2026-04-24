"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./icon";

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, footer, width = 520 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          background: "var(--bg-raised)",
          border: "1px solid var(--bd-default)",
          borderRadius: 6,
          boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
        }}
      >
        {title && (
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--bd-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
            <button onClick={onClose} style={{ color: "var(--tx-tertiary)", display: "flex" }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
        <div style={{ padding: 18 }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: 14,
              borderTop: "1px solid var(--bd-subtle)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
