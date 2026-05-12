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

/**
 * Generic card-shaped placeholder retained for legacy callers. New code
 * should reach for the shape-specific Skel variants below (BattleCardSkel,
 * FighterCardSkel etc.) so loading states scaffold the real layout
 * rather than gesturing at a different one.
 */
export function CardSkel({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: 14,
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
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

/**
 * Loading scaffold for `BattleCard` (apps/web/app/(app)/arenas/battle-card.tsx).
 * Mirrors the real card's outer padding (16), status-row dims, topic
 * line-height block (minHeight 40), fighter grid (1fr · auto · 1fr with
 * 32×32 Sigils), and pool/spectators footer with its top divider — so
 * the placeholder occupies the same vertical rhythm as the loaded card
 * and content swaps in without reflow.
 */
export function BattleCardSkel({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
        ...style,
      }}
    >
      {/* Status row: 12px icon-equivalent + label, round tag right. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <Skel w={12} h={12} style={{ borderRadius: 99 }} />
        <Skel w={56} h={10} />
        <Skel w={42} h={12} style={{ marginLeft: "auto" }} />
      </div>
      {/* Topic block: matches the loaded card's minHeight 40 / mb 14. */}
      <div style={{ minHeight: 40, marginBottom: 14 }}>
        <Skel w="100%" h={14} style={{ marginBottom: 6 }} />
        <Skel w="65%" h={14} />
      </div>
      {/* Fighter row: grid 1fr · auto · 1fr with 32×32 Sigils. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Skel w={32} h={32} style={{ borderRadius: 99, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skel w="80%" h={12} style={{ marginBottom: 4 }} />
            <Skel w={36} h={10} />
          </div>
        </div>
        <Skel w={14} h={11} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skel
              w="80%"
              h={12}
              style={{ marginBottom: 4, marginLeft: "auto" }}
            />
            <Skel w={36} h={10} style={{ marginLeft: "auto" }} />
          </div>
          <Skel w={32} h={32} style={{ borderRadius: 99, flexShrink: 0 }} />
        </div>
      </div>
      {/* Footer: pool · spectators, with top divider — mirror borderTop. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid var(--bd-subtle)",
        }}
      >
        <Skel w={80} h={11} />
        <Skel w={70} h={11} />
      </div>
    </div>
  );
}

export function TableSkel({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div
      style={{
        padding: "6px 0",
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
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
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
      }}
    >
      <Skel w={80} h={10} style={{ marginBottom: 8 }} />
      <Skel w={120} h={22} />
    </div>
  );
}

/**
 * Compact fighter card placeholder — mirrors the vault + profile shape:
 * 56×56 Sigil with name + archetype + ELO/W-L mono row, plus the
 * two-button action row at the bottom (Battle / View in vault,
 * Source battle / Fighter in moments-similar cards). 16px outer padding
 * to match the real Card prop.
 */
export function FighterCardSkel() {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Skel w={56} h={56} style={{ borderRadius: 99, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* name (15px 600) */}
          <Skel w="70%" h={15} style={{ marginBottom: 4 }} />
          {/* arch (11px tertiary) */}
          <Skel w="40%" h={11} />
          {/* ELO + W-L mono row, mt 8 */}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Skel w={50} h={11} />
            <Skel w={32} h={11} />
          </div>
        </div>
      </div>
      {/* action row mt 14 — two equal-width buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <Skel h={28} style={{ flex: 1 }} />
        <Skel h={28} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

/**
 * Marketplace fighter card placeholder — mirrors the larger display
 * variant in apps/web/app/(app)/market/page.tsx: a 72×72 Sigil top-left
 * with a TokenTag chip top-right, a big display-2 name (~26px) and a
 * mono archetype eyebrow, divided from a footer row that shows the
 * fighter's record + Buy/Hire/ELO split.
 */
export function MarketFighterCardSkel() {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 14,
        }}
      >
        <Skel w={72} h={72} style={{ borderRadius: 99, flexShrink: 0 }} />
        <Skel w={44} h={20} />
      </div>
      {/* Display-2 name @ ~26px line — two-line allowance kept simple */}
      <Skel w="80%" h={26} style={{ marginBottom: 6 }} />
      {/* Mono archetype eyebrow */}
      <Skel w={64} h={10} style={{ marginBottom: 12 }} />
      {/* Footer: record badge + price/hire split, divided by borderTop */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid var(--yap-ink-700)",
          gap: 6,
        }}
      >
        <Skel w={60} h={18} />
        <Skel w={90} h={18} />
      </div>
    </div>
  );
}

/**
 * Moment card placeholder — mirrors MomentCard
 * (apps/web/components/moment/moment-card.tsx): 56×56 Sigil with
 * "Moment #N" title, mono battle/round/side meta, Fighter #N
 * secondary text, and a two-button action row. Same skeleton shape
 * as the compact FighterCardSkel but with three lines under the title
 * instead of the ELO/W-L stat row.
 */
export function MomentCardSkel() {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Skel w={56} h={56} style={{ borderRadius: 99, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skel w="65%" h={14} style={{ marginBottom: 4 }} />
          <Skel w="80%" h={11} style={{ marginBottom: 6 }} />
          <Skel w={70} h={11} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <Skel h={28} style={{ flex: 1 }} />
        <Skel h={28} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
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
