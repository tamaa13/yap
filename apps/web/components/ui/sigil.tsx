// Procedural sigil avatar — deterministic abstract pattern from a seed.

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SigilProps {
  seed: string | number | null | undefined;
  size?: number;
  color?: string;
  bg?: string;
  radius?: number;
}

export function Sigil({ seed, size = 48, color = "#E8E9ED", bg = "#06070A", radius = 4 }: SigilProps) {
  const h = hash32(String(seed ?? ""));
  const cells = 6;
  const grid: Array<[number, number]> = [];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells / 2; x++) {
      const bit = (h >> ((y * (cells / 2) + x) % 30)) & 1;
      if (bit) {
        grid.push([x, y]);
        grid.push([cells - 1 - x, y]);
      }
    }
  }
  const shape = (h >> 20) & 3;
  const cs = size / cells;

  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: radius,
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        border: "1px solid var(--bd-subtle)",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {grid.map(([x, y], i) => {
          const px = x * cs;
          const py = y * cs;
          const s = cs - 0.5;
          if (shape === 0)
            return (
              <rect
                key={i}
                x={px + 0.5}
                y={py + 0.5}
                width={s - 0.5}
                height={s - 0.5}
                fill={color}
                opacity={0.9}
              />
            );
          if (shape === 1)
            return (
              <circle
                key={i}
                cx={px + cs / 2}
                cy={py + cs / 2}
                r={cs / 2 - 1}
                fill={color}
                opacity={0.9}
              />
            );
          if (shape === 2)
            return (
              <polygon
                key={i}
                points={`${px + cs / 2},${py + 1} ${px + cs - 1},${py + cs / 2} ${px + cs / 2},${py + cs - 1} ${px + 1},${py + cs / 2}`}
                fill={color}
                opacity={0.9}
              />
            );
          return (
            <g key={i} fill={color} opacity={0.9}>
              <rect x={px + cs * 0.35} y={py + cs * 0.1} width={cs * 0.3} height={cs * 0.8} />
              <rect x={px + cs * 0.1} y={py + cs * 0.35} width={cs * 0.8} height={cs * 0.3} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
