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

export interface TableSkelProps {
  rows?: number;
  cols?: number;
  /** Per-column width override. `"flex"` lets the column expand to fill
   *  the remaining space (matches a real `<td>` with no width clamp).
   *  Numeric or string values pass through as fixed widths. Defaults
   *  approximate the leaderboard layout. */
  widths?: Array<number | string | "flex">;
  /** Render a faux header row above the data rows so the placeholder
   *  matches tables that actually show one. Both wallet + leaderboard
   *  draw a header so it's on by default. */
  header?: boolean;
  /** Sigil-flagged column index — that column's leading bar gets a 28×28
   *  circular placeholder to mirror tables like leaderboard that pack a
   *  Sigil + name into a single fighter cell. */
  fighterCol?: number;
}

export function TableSkel({
  rows = 6,
  cols = 5,
  widths,
  header = true,
  fighterCol,
}: TableSkelProps) {
  const computedWidths: Array<number | string | "flex"> = Array.from(
    { length: cols },
    (_, c) => widths?.[c] ?? (c === 0 ? 30 : c === 1 ? "flex" : 70),
  );

  const renderRow = (rowIdx: number, isHeader: boolean) => (
    <div
      key={isHeader ? "header" : rowIdx}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderTop:
          rowIdx === 0 && !isHeader && !header
            ? "none"
            : "1px solid var(--bd-subtle)",
        background: isHeader ? "var(--bg-sunken)" : undefined,
      }}
    >
      {computedWidths.map((w, c) => {
        const flexShrink = w === "flex" ? 1 : 0;
        const flexGrow = w === "flex" ? 1 : 0;
        // Fighter column: avatar + label pair when not the header row.
        if (!isHeader && c === fighterCol) {
          return (
            <div
              key={c}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: w === "flex" ? "1 1 0" : `0 0 ${typeof w === "number" ? `${w}px` : w}`,
                minWidth: 0,
              }}
            >
              <Skel
                w={28}
                h={28}
                style={{ borderRadius: 99, flexShrink: 0 }}
              />
              <Skel w="60%" h={12} />
            </div>
          );
        }
        return (
          <Skel
            key={c}
            w={w === "flex" ? "100%" : w}
            h={isHeader ? 10 : 12}
            style={{
              flexShrink,
              flexGrow,
              flexBasis: w === "flex" ? 0 : undefined,
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        padding: "0",
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 0,
      }}
    >
      {header && renderRow(-1, true)}
      {Array.from({ length: rows }).map((_, r) => renderRow(r, false))}
    </div>
  );
}

/**
 * Mirrors `<StatCard>` (components/ui/stat-card.tsx): 16px padding,
 * 6px border radius, label (~11px tertiary, mb 6), value (~22px num),
 * optional sub-line (~12px tertiary, mt 4). The real component renders
 * a sub on every wallet/vault call site we have, so the placeholder
 * scaffolds the three-line height by default.
 */
export function StatCardSkel({ withSub = true }: { withSub?: boolean } = {}) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--yap-ink-800)",
        border: "1px solid var(--yap-ink-600)",
        borderRadius: 6,
      }}
    >
      <Skel w={80} h={11} style={{ marginBottom: 6 }} />
      <Skel w={120} h={22} />
      {withSub && <Skel w={56} h={12} style={{ marginTop: 4 }} />}
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

/**
 * Mirror of `FighterDetail` (apps/web/app/(app)/fighters/[tokenId]/
 * fighter-detail.tsx) loading state: breadcrumbs row, 2-col page grid
 * (1fr · 360px), big hero Card with 120×120 Sigil and 4-up stat grid,
 * tabs strip, and a content placeholder beneath. The prior loading
 * state was a single `<Skel h={160} />` block — usable as a flicker
 * mask but nowhere near matching the loaded layout.
 */
export function FighterDetailSkel() {
  return (
    <div>
      {/* Breadcrumbs row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Skel w={84} h={11} />
        <Skel w={6} h={11} />
        <Skel w={108} h={11} />
      </div>
      <div
        className="al-detail-2col"
        style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}
      >
        {/* Left column — hero card + tabs + content */}
        <div>
          <div
            style={{
              padding: 24,
              marginBottom: 16,
              background: "var(--yap-ink-800)",
              border: "1px solid var(--yap-ink-600)",
            }}
          >
            <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
              <Skel
                w={120}
                h={120}
                style={{ borderRadius: 6, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Name + TEE badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <Skel w={200} h={28} />
                  <Skel w={56} h={18} />
                </div>
                {/* Arch */}
                <Skel w={120} h={13} style={{ marginBottom: 12 }} />
                {/* 4-up stat grid (ELO, Record, Battles, Earnings) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 14,
                  }}
                >
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i}>
                      <Skel w={48} h={10} style={{ marginBottom: 6 }} />
                      <Skel w={64} h={20} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Action button row */}
            <div style={{ display: "flex", gap: 8 }}>
              <Skel w={140} h={32} />
              <Skel w={120} h={32} />
              <Skel w={100} h={32} />
            </div>
          </div>
          {/* Tabs strip */}
          <div style={{ display: "flex", gap: 18, marginBottom: 16 }}>
            <Skel w={66} h={14} />
            <Skel w={70} h={14} />
            <Skel w={74} h={14} />
            <Skel w={56} h={14} />
          </div>
          {/* Tab content placeholder — overview body */}
          <div
            style={{
              padding: 20,
              background: "var(--yap-ink-800)",
              border: "1px solid var(--yap-ink-600)",
            }}
          >
            <Skel w="100%" h={12} style={{ marginBottom: 8 }} />
            <Skel w="95%" h={12} style={{ marginBottom: 8 }} />
            <Skel w="60%" h={12} />
          </div>
        </div>
        {/* Right column — seller/owner panel */}
        <div
          style={{
            padding: 20,
            background: "var(--yap-ink-800)",
            border: "1px solid var(--yap-ink-600)",
            alignSelf: "start",
          }}
        >
          <Skel w={84} h={11} style={{ marginBottom: 14 }} />
          <Skel w="70%" h={14} style={{ marginBottom: 6 }} />
          <Skel w="50%" h={12} style={{ marginBottom: 18 }} />
          <Skel h={36} style={{ marginBottom: 8 }} />
          <Skel h={36} />
        </div>
      </div>
    </div>
  );
}

/**
 * Loading shell for `/arenas/[battleId]`. The route picks between
 * ArenaPending / ArenaLive on the fly so the placeholder has to cover
 * the shared chrome: Breadcrumbs strip, a big Card with status badge +
 * topic line + 1fr-auto-1fr fighter row, and a follow-up Card for the
 * round/bet area below.
 */
export function ArenaShellSkel() {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Skel w={66} h={11} />
        <Skel w={6} h={11} />
        <Skel w={108} h={11} />
      </div>
      <div
        style={{
          padding: 24,
          marginBottom: 16,
          background: "var(--yap-ink-800)",
          border: "1px solid var(--yap-ink-600)",
        }}
      >
        <Skel w={140} h={20} style={{ marginBottom: 10 }} />
        <Skel w="80%" h={22} style={{ marginBottom: 8 }} />
        <Skel w={180} h={12} style={{ marginBottom: 18 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 20,
            alignItems: "center",
            padding: "14px 0",
            borderTop: "1px solid var(--bd-subtle)",
            borderBottom: "1px solid var(--bd-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Skel w={48} h={48} style={{ borderRadius: 99, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <Skel w={84} h={9} style={{ marginBottom: 6 }} />
              <Skel w={120} h={15} style={{ marginBottom: 4 }} />
              <Skel w={90} h={11} />
            </div>
          </div>
          <Skel w={18} h={12} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexDirection: "row-reverse",
            }}
          >
            <Skel w={48} h={48} style={{ borderRadius: 99, flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: "right" }}>
              <Skel
                w={84}
                h={9}
                style={{ marginBottom: 6, marginLeft: "auto" }}
              />
              <Skel
                w={120}
                h={15}
                style={{ marginBottom: 4, marginLeft: "auto" }}
              />
              <Skel w={90} h={11} style={{ marginLeft: "auto" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <Skel w={140} h={36} />
          <Skel w={120} h={36} />
        </div>
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
