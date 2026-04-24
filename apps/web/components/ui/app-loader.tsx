import { YapMark } from "@/components/brand/yap-mark";

export function AppLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-canvas)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        zIndex: 10000,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <YapMark size={36} />
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            fontFamily: "var(--sans)",
          }}
        >
          yap
        </span>
      </div>
      <div
        style={{
          width: 140,
          height: 2,
          background: "var(--bd-subtle)",
          overflow: "hidden",
          borderRadius: 1,
        }}
      >
        <div
          style={{
            width: "40%",
            height: "100%",
            background: "var(--accent)",
            animation: "al-loader 1.2s ease-in-out infinite",
          }}
        />
      </div>
      <div className="label" style={{ fontSize: 10 }}>
        {label}
      </div>
    </div>
  );
}
