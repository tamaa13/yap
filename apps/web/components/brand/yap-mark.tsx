export interface YapMarkProps {
  size?: number;
  color?: string;
  bg?: string;
}

// Defaults sourced from Promoter palette: --yap-crimson and --yap-ink-950.
// Hex literals because SVG attributes don't accept CSS vars; passers can
// override with hex strings if a different ground/figure pair is needed.
export function YapMark({ size = 22, color = "#C8102E", bg = "#0E0B08" }: YapMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect x="0" y="0" width="24" height="24" rx="5" fill={color} />
      <path
        d="M6 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4.5L8 18v-2.5H8a2 2 0 0 1-2-2v-5Z"
        fill={bg}
      />
      <circle cx="12" cy="11" r="1.5" fill={color} />
    </svg>
  );
}
