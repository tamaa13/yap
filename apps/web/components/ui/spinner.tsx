import type { CSSProperties } from "react";

export interface SpinnerProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Spinner({ size = 16, color = "var(--accent)", style }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "block", animation: "al-spin 800ms linear infinite", ...style }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        opacity="0.15"
        style={{ color }}
      />
      <path
        d="M12 3 a 9 9 0 0 1 9 9"
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
