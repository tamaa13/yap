/* global React */
/* ───────────────────────────────────────────────────────────
   Page-mock shared bits — icons, sigils, mini components.
   Combat vocab line icons (2px stroke, square cap).
   ─────────────────────────────────────────────────────────── */

// ─── ICONS ──────────────────────────────────────────────────
const Icon = {
  Glove: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M5 9 v9 a2 2 0 0 0 2 2 h9 a2 2 0 0 0 2 -2 v-3" />
      <path d="M5 9 a4 4 0 0 1 4 -4 h5 a4 4 0 0 1 4 4 v5 h-4 v-2 h-1 v2 h-1 v-3 h-1 v3 h-1 v-2 h-1 v2 h-4 z" />
      <path d="M14 19 v1" />
    </svg>
  ),
  Bell: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M6 17 v-5 a6 6 0 0 1 12 0 v5 z" />
      <path d="M4 17 h16 v2 h-16 z" />
      <path d="M11 4 h2 v2 h-2 z M10 20 h4 v2 a2 2 0 0 1 -4 0 z" />
    </svg>
  ),
  Mic: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <rect x="9" y="3" width="6" height="11" />
      <path d="M6 11 v2 a6 6 0 0 0 12 0 v-2" />
      <path d="M12 19 v3 M9 22 h6" />
    </svg>
  ),
  Trophy: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M7 4 h10 v6 a5 5 0 0 1 -10 0 z" />
      <path d="M4 5 h3 v3 a3 3 0 0 1 -3 -3 z M20 5 h-3 v3 a3 3 0 0 0 3 -3 z" />
      <path d="M10 14 h4 v3 h-4 z M8 17 h8 v2 h-8 z" />
    </svg>
  ),
  Gavel: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <rect x="3" y="14" width="14" height="3" transform="rotate(-45 3 14)" />
      <rect x="11" y="6" width="9" height="3" transform="rotate(-45 11 6)" />
      <path d="M3 21 h12" />
    </svg>
  ),
  Seal: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M12 3 l8 4 v6 a8 9 0 0 1 -8 8 a8 9 0 0 1 -8 -8 v-6 z" />
      <path d="M9 12 l2 2 l4 -4" />
    </svg>
  ),
  Chain: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M9 13 l-3 3 a3 3 0 0 1 -4 -4 l3 -3 a3 3 0 0 1 4 0" />
      <path d="M15 11 l3 -3 a3 3 0 0 1 4 4 l-3 3 a3 3 0 0 1 -4 0" />
      <path d="M9 14 l5 -5" />
    </svg>
  ),
  Ticker: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <rect x="3" y="6" width="18" height="12" />
      <path d="M3 10 h18 M6 14 h3 M11 14 h5 M17 14 h2" />
    </svg>
  ),
  Punch: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M5 11 l4 -4 l3 0 l1 -2 l4 1 l-1 4 l3 3 l-2 4 l-4 0 l-3 3 l-4 -4 z" />
      <path d="M11 11 l3 0 M9 14 l2 0" />
    </svg>
  ),
  Wallet: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <rect x="3" y="6" width="18" height="13" />
      <path d="M16 12 h5 v3 h-5 z M3 6 v-1 h14 v1" />
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <circle cx="10" cy="10" r="6" />
      <path d="M14 14 l6 6" />
    </svg>
  ),
  Arrow: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M4 12 h15 M14 7 l5 5 l-5 5" />
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M12 4 v16 M4 12 h16" />
    </svg>
  ),
  Caret: (p) => (
    <svg viewBox="0 0 24 24" className="ic" {...p}>
      <path d="M6 9 l6 6 l6 -6" />
    </svg>
  ),
  Dot: () => <span className="dot" style={{display:"inline-block",width:6,height:6,background:"currentColor",borderRadius:"50%"}}/>
};

// ─── SIGIL — fighter avatar placeholder ─────────────────────
function Sigil({ size = 96, letter = 'Y', tone = 'crimson', label }) {
  const isGold = tone === 'gold';
  return (
    <div className={"sigil " + (isGold ? "sigil--gold" : "")}
      style={{ width: size, height: size }}>
      <div className="y" style={{ fontSize: size * 0.6, color: isGold ? 'var(--yap-gold)' : 'var(--yap-ink-50)' }}>{letter}</div>
      {label && <div style={{
        position: 'absolute', bottom: 4, left: 6,
        fontFamily: 'var(--yap-font-mono)', fontSize: 8, letterSpacing: 1.5,
        color: 'var(--yap-ink-300)', textTransform: 'uppercase'
      }}>{label}</div>}
    </div>
  );
}

// ─── HP STAT BLOCK ──────────────────────────────────────────
function StatBars({ hp = 16, logic = 14, wit = 11, tone = 'crimson' }) {
  const max = 20;
  const bar = (val, kind) => (
    <div className={"hp-row " + kind}>
      <span className="lbl">{kind === '' ? 'HP' : kind === 'gold' ? 'LGC' : kind === 'warn' ? 'WIT' : kind.toUpperCase()}</span>
      <span className="seg">
        {Array.from({ length: max }, (_, i) =>
          <span key={i} className={i < val ? 'on' : ''} />
        )}
      </span>
      <span className="val">{String(val).padStart(2, '0')}</span>
    </div>
  );
  // rebuild more legibly:
  const row = (lbl, val, kind) => (
    <div className={"hp-row " + (kind || '')} key={lbl}>
      <span className="lbl">{lbl}</span>
      <span className="seg">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < val ? 'on' : ''} />
        ))}
      </span>
      <span className="val">{String(val).padStart(2, '0')}</span>
    </div>
  );
  const tones = tone === 'gold' ? { hp: 'gold', lgc: 'gold', wit: 'gold' } : { hp: '', lgc: 'info', wit: 'warn' };
  return (
    <div className="hp">
      {row('HP',  hp,    tones.hp)}
      {row('LGC', logic, tones.lgc)}
      {row('WIT', wit,   tones.wit)}
    </div>
  );
}

// ─── ANNOTATION SHELL ───────────────────────────────────────
function Notes({ title, summary, components, motion }) {
  return (
    <div className="note-panel" style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <h4>{title}</h4>
      <p style={{ margin: '0 0 12px', color: 'var(--yap-ink-700)' }}>{summary}</p>
      <hr style={{ border: 0, borderTop: '1px solid rgba(20,17,14,.15)', margin: '12px 0' }} />
      <div className="lbl">Components used</div>
      <ul>{components.map((c, i) => <li key={i} dangerouslySetInnerHTML={{ __html: c }} />)}</ul>
      <div className="lbl">Motion notes</div>
      <ul>{motion.map((m, i) => <li key={i} dangerouslySetInnerHTML={{ __html: m }} />)}</ul>
    </div>
  );
}

// ─── PAPER STRIP — for fighter-card decoration ──────────────
function NumPlate({ num, label }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      fontFamily: 'var(--yap-font-display)', textTransform: 'uppercase',
      lineHeight: 1, color: 'var(--yap-ink-50)'
    }}>
      <span style={{ fontSize: 11, color: 'var(--yap-ink-400)', letterSpacing: 2 }}>{label}</span>
      <span style={{ fontSize: 22, color: 'var(--yap-ink-50)' }}>{num}</span>
    </div>
  );
}

// ─── EXPORT ─────────────────────────────────────────────────
Object.assign(window, { Icon, Sigil, StatBars, Notes, NumPlate });
