import { YapMark } from "./yap-mark";

export function YapWordmark({ size = 72, color = "var(--tx-primary)" }: { size?: number; color?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.18 }}>
      <YapMark size={size} />
      <span
        style={{
          fontSize: size * 0.92,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          color,
          fontFamily: "var(--sans)",
        }}
      >
        yap
      </span>
    </div>
  );
}
