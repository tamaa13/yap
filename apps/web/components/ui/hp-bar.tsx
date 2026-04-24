export interface HPBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  showText?: boolean;
  label?: string;
}

export function HPBar({
  value,
  max = 100,
  color = "var(--accent)",
  height = 6,
  showText = false,
  label,
}: HPBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span className="label">{label}</span>
          {showText && (
            <span className="num" style={{ fontSize: 11, color: "var(--tx-secondary)" }}>
              {value}/{max}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          width: "100%",
          height,
          background: "var(--bg-sunken)",
          border: "1px solid var(--bd-subtle)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            transition: "width 400ms ease-out",
          }}
        />
      </div>
    </div>
  );
}
