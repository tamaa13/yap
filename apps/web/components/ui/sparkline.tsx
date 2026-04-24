export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 80, height = 24 }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${i * step},${height - ((v - min) / rng) * (height - 2) - 1}`)
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--success)" : "var(--danger)"}
        strokeWidth="1.25"
      />
    </svg>
  );
}
