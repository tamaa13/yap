"use client";

import { Typewriter } from "@/components/ui/typewriter";
import type { ArgumentLine as ArgumentLineType, Fighter } from "@/lib/types";

export function ArgumentLine({
  arg,
  fighters,
  isLatest,
  typing,
}: {
  arg: ArgumentLineType;
  fighters: { a: Fighter; b: Fighter };
  isLatest: boolean;
  typing: boolean;
}) {
  if (arg.speaker === "judge") {
    return (
      <div
        style={{
          padding: "12px 16px",
          margin: "4px 0",
          background: "rgba(255,184,0,0.04)",
          borderLeft: "2px solid var(--accent-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginBottom: 4,
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: 0.08,
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          <span>R{arg.r}</span>
          <span>·</span>
          <span>{arg.t}</span>
          <span>·</span>
          <span>Judge-TEE</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--tx-primary)", lineHeight: 1.55 }}>
          {arg.text}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--tx-tertiary)",
          }}
        >
          signed: 0x7d2f8b…b8c7a1
        </div>
      </div>
    );
  }

  const f = fighters[arg.speaker];
  const cColor = arg.speaker === "a" ? "var(--fighter-a)" : "var(--fighter-b)";
  return (
    <div
      style={{
        padding: "10px 16px",
        margin: "2px 0",
        borderLeft: isLatest ? `2px solid ${cColor}` : "2px solid transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 4,
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: 0.08,
          textTransform: "uppercase",
          color: "var(--tx-tertiary)",
        }}
      >
        <span>R{arg.r}</span>
        <span>·</span>
        <span>{arg.t}</span>
        <span>·</span>
        <span style={{ color: cColor }}>{f.name}</span>
      </div>
      <div style={{ fontSize: 14, color: "var(--tx-primary)", lineHeight: 1.6 }}>
        {typing ? <Typewriter text={arg.text} speed={14} /> : arg.text}
      </div>
    </div>
  );
}
