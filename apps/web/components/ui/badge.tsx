import type { CSSProperties, ReactNode } from "react";

/**
 * Six fight-promotion badge primitives. Each maps to one job —
 * mixing them is the antidote to "every dApp has the same status
 * pill". See docs/design/project/design-system.html § badges and
 * apps/web/MOTION.md for the conditional-pulse rule.
 *
 *   <Badge>      Mono — quiet inline status (table rows, kept for compat)
 *   <Stamp>      Loud crimson block + cut corner (LIVE, KO, VERIFIED)
 *   <Tape>       Cream paper strip, hole-punched, tilted (1st Ed, Top 10)
 *   <TokenTag>   Bracketed mono [ #4827 ]  (addresses, IDs, hashes)
 *   <Split>      Two-tone key/value chip (ELO/Round/Pool standalone)
 *   <Record>     Fight card "14×3" with crimson W + dim L
 */

// ─── Mono base — inline-table compat ────────────────────────────────────

export type BadgeTone =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "gold"
  | "a"
  | "b";

const TONE_CLASS: Record<BadgeTone, string> = {
  default: "",
  // Accent maps to the danger/info-bg shape since the Mono base reads
  // as a soft tone-shift; "accent" callers want crimson — gold's
  // bordered variant is the closest non-loud match.
  accent: "badge--a",
  success: "badge--success",
  warning: "badge--warning",
  danger: "badge--danger",
  info: "badge--info",
  gold: "badge--gold",
  a: "badge--a",
  b: "badge--b",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** @deprecated — Mono is always the default style. Prop kept for
   *  callsite compat; toggling it has no effect on the new CSS-driven
   *  variant. */
  mono?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function Badge({ children, tone = "default", style, className }: BadgeProps) {
  const cls = ["badge", TONE_CLASS[tone], className].filter(Boolean).join(" ");
  return (
    <span className={cls} style={style}>
      {children}
    </span>
  );
}

// ─── Stamp — crimson cut-corner block + Anton caps ──────────────────────

export type StampTone = "default" | "gold" | "ink" | "bruise";
const STAMP_CLASS: Record<StampTone, string> = {
  default: "",
  gold: "stamp-badge--gold",
  ink: "stamp-badge--ink",
  bruise: "stamp-badge--bruise",
};

export interface StampProps {
  children: ReactNode;
  tone?: StampTone;
  /** Optional left-side dot. When `pulse` is true, the dot animates
   *  via the `.pulse-anim` class. Caller must gate `pulse` on a
   *  non-terminal state (per MOTION.md ambient anti-pattern — never
   *  loop on idle elements). */
  dot?: boolean;
  pulse?: boolean;
  /** Optional serial pad (right side, divider rule). Used for
   *  broadcast feel: "LIVE · R02 | 14:22". */
  serial?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Stamp({
  children,
  tone = "default",
  dot,
  pulse,
  serial,
  style,
  className,
}: StampProps) {
  const cls = ["stamp-badge", STAMP_CLASS[tone], className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={style}>
      {dot && (
        <span className={`pulse${pulse ? " pulse-anim" : ""}`} aria-hidden />
      )}
      {children}
      {serial && <span className="ser">{serial}</span>}
    </span>
  );
}

// ─── Tape — cream paper strip, hole-punched, tilted ─────────────────────

export type TapeTone = "default" | "crim" | "gold";
const TAPE_CLASS: Record<TapeTone, string> = {
  default: "",
  crim: "tape-badge--crim",
  gold: "tape-badge--gold",
};

export interface TapeProps {
  children: ReactNode;
  tone?: TapeTone;
  style?: CSSProperties;
  className?: string;
}

export function Tape({ children, tone = "default", style, className }: TapeProps) {
  const cls = ["tape-badge", TAPE_CLASS[tone], className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={style}>
      {children}
    </span>
  );
}

// ─── TokenTag — bracketed mono for addresses/IDs/hashes ─────────────────

export type TokenTagTone = "default" | "gold";
const TOKEN_CLASS: Record<TokenTagTone, string> = {
  default: "",
  gold: "token-badge--gold",
};

export interface TokenTagProps {
  children: ReactNode;
  tone?: TokenTagTone;
  style?: CSSProperties;
  className?: string;
}

export function TokenTag({
  children,
  tone = "default",
  style,
  className,
}: TokenTagProps) {
  const cls = ["token-badge", TOKEN_CLASS[tone], className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={style}>
      {children}
    </span>
  );
}

// ─── Split — two-tone key/value standalone stat chip ────────────────────

export type SplitTone = "default" | "crim" | "gold" | "bruise";
const SPLIT_CLASS: Record<SplitTone, string> = {
  default: "",
  crim: "split-badge--crim",
  gold: "split-badge--gold",
  bruise: "split-badge--bruise",
};

export interface SplitProps {
  k: ReactNode;
  v: ReactNode;
  tone?: SplitTone;
  size?: "default" | "sm";
  style?: CSSProperties;
  className?: string;
}

export function Split({
  k,
  v,
  tone = "default",
  size = "default",
  style,
  className,
}: SplitProps) {
  const cls = [
    "split-badge",
    SPLIT_CLASS[tone],
    size === "sm" ? "split-badge--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={style}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </span>
  );
}

// ─── Record — fight-card "W×L" ──────────────────────────────────────────

export interface RecordProps {
  w: number | string;
  l: number | string;
  /** Optional caption to the right (e.g. "RECORD"). */
  label?: ReactNode;
  size?: "default" | "sm";
  style?: CSSProperties;
  className?: string;
}

// Avoid colliding with the TS built-in `Record<K, V>` utility type.
export function RecordBadge({
  w,
  l,
  label,
  size = "default",
  style,
  className,
}: RecordProps) {
  const cls = [
    "record-badge",
    size === "sm" ? "record-badge--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={style}>
      <span className="w">{w}</span>
      <span className="x">×</span>
      <span className="l">{l}</span>
      {label && <span className="lbl">{label}</span>}
    </span>
  );
}
