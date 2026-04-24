import type { CSSProperties } from "react";
import { Icon } from "./icon";
import { Spinner } from "./spinner";

export type TxStepStatus = "pending" | "active" | "done" | "error";
export interface TxStep {
  label: string;
  status: TxStepStatus;
  hint?: string;
}

export interface TxStepsProps {
  steps: TxStep[];
  style?: CSSProperties;
}

export function TxSteps({ steps, style }: TxStepsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, ...style }}>
      {steps.map((s, i) => {
        const iconColor =
          s.status === "done"
            ? "var(--success)"
            : s.status === "active"
              ? "var(--accent)"
              : s.status === "error"
                ? "var(--danger)"
                : "var(--tx-tertiary)";
        const txColor = s.status === "pending" ? "var(--tx-tertiary)" : "var(--tx-primary)";
        return (
          <div
            key={i}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0" }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
                flexShrink: 0,
              }}
            >
              {s.status === "active" ? (
                <Spinner size={14} color={iconColor} />
              ) : s.status === "done" ? (
                <Icon name="check" size={14} style={{ color: iconColor }} />
              ) : s.status === "error" ? (
                <Icon name="x" size={14} style={{ color: iconColor }} />
              ) : (
                <div
                  style={{ width: 6, height: 6, borderRadius: 99, background: iconColor }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: txColor,
                  fontWeight: s.status === "active" ? 500 : 400,
                }}
              >
                {s.label}
              </div>
              {s.hint && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tx-tertiary)",
                    fontFamily: "var(--mono)",
                    marginTop: 2,
                    wordBreak: "break-all",
                  }}
                >
                  {s.hint}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
