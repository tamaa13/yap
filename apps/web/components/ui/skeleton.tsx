import type { CSSProperties } from "react";

export interface SkelProps {
  w?: number | string;
  h?: number | string;
  style?: CSSProperties;
}

export function Skel({ w = "100%", h = 12, style }: SkelProps) {
  return (
    <div
      className="al-skel"
      style={{ width: w, height: h, borderRadius: 3, ...style }}
    />
  );
}

export function CardSkel({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: 14,
        background: "var(--bg-surface)",
        border: "1px solid var(--bd-default)",
        borderRadius: 6,
        ...style,
      }}
    >
      <Skel w={120} h={10} style={{ marginBottom: 10 }} />
      <Skel w="100%" h={14} style={{ marginBottom: 6 }} />
      <Skel w="80%" h={14} style={{ marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Skel w={36} h={36} style={{ borderRadius: 4 }} />
        <div style={{ flex: 1 }}>
          <Skel w="60%" h={10} style={{ marginBottom: 4 }} />
          <Skel w="40%" h={8} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Skel w={60} h={20} />
        <Skel w={60} h={20} />
      </div>
    </div>
  );
}

export function TableSkel({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div
      style={{
        padding: "6px 0",
        background: "var(--bg-surface)",
        border: "1px solid var(--bd-default)",
        borderRadius: 6,
      }}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: "flex",
            gap: 12,
            padding: "12px 14px",
            borderTop: r > 0 ? "1px solid var(--bd-subtle)" : "none",
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skel
              key={c}
              w={c === 0 ? 30 : c === 1 ? 160 : 70}
              h={12}
              style={{ flexShrink: 0 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatCardSkel() {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--bg-surface)",
        border: "1px solid var(--bd-default)",
        borderRadius: 6,
      }}
    >
      <Skel w={80} h={10} style={{ marginBottom: 8 }} />
      <Skel w={120} h={22} />
    </div>
  );
}

export function FighterCardSkel() {
  return (
    <div
      style={{
        padding: 14,
        background: "var(--bg-surface)",
        border: "1px solid var(--bd-default)",
        borderRadius: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Skel w={48} h={48} style={{ borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <Skel w="55%" h={12} style={{ marginBottom: 4 }} />
          <Skel w="35%" h={10} />
        </div>
        <Skel w={36} h={12} style={{ flexShrink: 0 }} />
      </div>
      <Skel w="100%" h={6} style={{ marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <Skel w={50} h={18} />
        <Skel w={50} h={18} />
        <Skel w={50} h={18} />
      </div>
    </div>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--bg-surface)",
        border: "1px solid var(--bd-default)",
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Skel w={32} h={32} style={{ borderRadius: 4 }} />
        <div style={{ flex: 1 }}>
          <Skel w="40%" h={10} />
          <Skel w="25%" h={8} style={{ marginTop: 6 }} />
        </div>
      </div>
      <Skel w="100%" h={10} />
      <Skel w="75%" h={10} />
      <div style={{ flex: 1, minHeight: Math.max(0, height - 100) }} />
    </div>
  );
}
