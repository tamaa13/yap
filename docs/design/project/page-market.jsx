/* global React, Icon, Sigil, Notes */
/* ─── 04 · Marketplace ───────────────────────────────────── */

function MarketTabs({ active = 'fighters', compact }) {
  const tabs = [
    { k: 'fighters', t: 'Fighters', n: '4,827' },
    { k: 'moments',  t: 'Moments',  n: '11,304' },
  ];
  return (
    <div style={{ display: 'flex', gap: compact ? 6 : 10, alignItems: 'flex-end', borderBottom: '1px solid var(--yap-ink-700)' }}>
      {tabs.map(t => {
        const on = active === t.k;
        return (
          <div key={t.k} style={{
            padding: compact ? '8px 12px 10px' : '12px 18px 14px',
            position: 'relative',
            borderBottom: on ? '3px solid var(--yap-crimson)' : '3px solid transparent',
            marginBottom: -1, display: 'flex', gap: 8, alignItems: 'baseline'
          }}>
            <span className="disp" style={{
              fontSize: compact ? 22 : 28,
              color: on ? 'var(--yap-ink-50)' : 'var(--yap-ink-400)'
            }}>{t.t}</span>
            <span className="mono" style={{
              fontSize: 11, letterSpacing: 1.5,
              color: on ? 'var(--yap-gold)' : 'var(--yap-ink-500)'
            }}>{t.n}</span>
          </div>
        );
      })}
    </div>
  );
}

function FilterBar({ compact }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? '1fr' : 'minmax(0,1fr) 110px 110px 180px 110px',
      gap: 8, alignItems: 'flex-end'
    }}>
      <div>
        <span className="input-label">Search</span>
        <div style={{ position: 'relative' }}>
          <input className="input input--mono" placeholder="silver-tongue, lacuna…" />
          <Icon.Search className="ic" style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--yap-ink-400)', width: 16, height: 16
          }}/>
        </div>
      </div>
      {!compact && <>
        <div>
          <span className="input-label">Min · OG</span>
          <input className="input input--mono" defaultValue="0.50" />
        </div>
        <div>
          <span className="input-label">Max · OG</span>
          <input className="input input--mono" defaultValue="50.00" />
        </div>
        <div>
          <span className="input-label">Archetype</span>
          <select className="input" defaultValue="all" style={{ appearance: 'none' }}>
            <option>All archetypes</option>
            <option>silver-tongue</option>
            <option>brawler</option>
            <option>logician</option>
            <option>wildcard</option>
          </select>
        </div>
        <div>
          <span className="input-label">Sort</span>
          <select className="input" defaultValue="elo">
            <option>ELO ↓</option>
            <option>Price ↑</option>
            <option>Recent</option>
          </select>
        </div>
      </>}
    </div>
  );
}

function FighterCard({ f, idx, compact, hover }) {
  return (
    <div style={{
      background: 'var(--yap-ink-800)',
      border: hover ? '1px solid var(--yap-crimson)' : '1px solid var(--yap-ink-600)',
      padding: compact ? 12 : 16,
      transform: hover ? 'translateY(-4px)' : 'none',
      boxShadow: hover ? 'var(--yap-sh-2)' : 'var(--yap-sh-1)',
      transition: 'all var(--yap-t-base) var(--yap-ease-out)',
      position: 'relative'
    }}>
      {f.tape && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}>
          <span className={`tape-badge ${f.tapeKind === 'gold' ? 'tape-badge--gold' : ''}`}>{f.tape}</span>
        </div>
      )}
      <Sigil size={compact ? 80 : 110} letter={f.n[0]} tone={idx % 2 ? 'gold' : 'crimson'}/>
      <div className="disp" style={{ fontSize: compact ? 22 : 30, marginTop: 12, lineHeight: 0.95 }}>{f.n}</div>
      <div className="mono" style={{
        fontSize: 10, color: 'var(--yap-ink-300)', letterSpacing: 1.5,
        textTransform: 'uppercase', marginBottom: 12
      }}>{f.arch}</div>

      <div style={{
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '8px 0', borderTop: '1px solid var(--yap-ink-700)',
        borderBottom: '1px solid var(--yap-ink-700)', marginBottom: 12
      }}>
        <span className="record-badge record-badge--sm">
          <span className="w">{f.w}</span><span className="x">×</span><span className="l">{f.l}</span>
        </span>
        <span style={{ fontFamily: 'var(--yap-font-mono)', fontSize: 10, color: 'var(--yap-ink-400)', letterSpacing: 1.5 }}>
          ELO <span style={{ color: 'var(--yap-ink-100)' }}>{f.elo}</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Icon.Punch className="ic" style={{ width: 14, height: 14, color: f.streak ? 'var(--yap-crimson)' : 'var(--yap-ink-500)' }}/>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="split-badge split-badge--sm split-badge--gold">
          <span className="k">Buy</span><span className="v">{f.price} OG</span>
        </span>
        <button className="btn btn--primary btn--sm">Bid →</button>
      </div>
    </div>
  );
}

function FighterGrid({ compact }) {
  const fighters = [
    { n: 'Lacuna',    arch: 'silver-tongue', elo: 1788, w: 9,  l: 2, price: '4.20', tape: '1st Edition', tapeKind: 'crim', streak: true },
    { n: 'Stiletto',  arch: 'silver-tongue', elo: 1842, w: 14, l: 3, price: '12.40', tape: 'Top 10', tapeKind: 'gold', streak: true },
    { n: 'Pyreclaw',  arch: 'brawler',       elo: 1801, w: 11, l: 6, price: '8.00',  streak: false },
    { n: 'Junkyard',  arch: 'wildcard',      elo: 1764, w: 8,  l: 5, price: '3.10',  streak: false },
    { n: 'Mercier',   arch: 'logician',      elo: 1719, w: 9,  l: 7, price: '2.80',  tape: 'Hot Streak', tapeKind: 'crim', streak: true },
    { n: 'Vellum',    arch: 'silver-tongue', elo: 1683, w: 7,  l: 4, price: '1.95',  streak: false },
    { n: 'Kestrel',   arch: 'wildcard',      elo: 1641, w: 5,  l: 3, price: '1.40',  streak: false },
    { n: 'Boilermaker',arch:'brawler',       elo: 1622, w: 4,  l: 6, price: '0.95',  streak: false },
  ];
  const list = compact ? fighters.slice(0, 4) : fighters;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(4,1fr)',
      gap: compact ? 8 : 16
    }}>
      {list.map((f, i) => (
        <FighterCard key={f.n} f={f} idx={i} compact={compact} hover={i === 1}/>
      ))}
    </div>
  );
}

function VolumeStrip({ compact }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: compact ? '12px 14px' : '14px 28px',
      background: 'var(--yap-ink-950)',
      borderTop: '1px solid var(--yap-ink-700)',
      borderBottom: '1px solid var(--yap-ink-700)'
    }}>
      <span className="cap" style={{ color: 'var(--yap-crimson)' }}>━━ Floor</span>
      <span className="split-badge split-badge--sm"><span className="k">24h Vol</span><span className="v">412.6 OG</span></span>
      <span className="split-badge split-badge--sm"><span className="k">Listings</span><span className="v">182</span></span>
      <span className="split-badge split-badge--sm split-badge--crim"><span className="k">Floor</span><span className="v">0.95 OG</span></span>
      {!compact && <span className="tape-badge tape-badge--gold" style={{ marginLeft: 'auto' }}>Top earner · Stiletto</span>}
    </div>
  );
}

function MarketDesktop() {
  return (
    <div className="yap-surface" style={{ width: 1440, height: 900, display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 56px', borderBottom: '1px solid var(--yap-ink-700)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 28, height: 28, border: '2px solid var(--yap-ink-50)',
            display: 'grid', placeItems: 'center', position: 'relative'
          }}>
            <span style={{ fontFamily: 'var(--yap-font-display)', fontSize: 22, lineHeight: 1 }}>Y</span>
            <span style={{ position: 'absolute', top: -2, left: -2, width: 5, height: 5, background: 'var(--yap-crimson)' }}/>
            <span style={{ position: 'absolute', bottom: -2, right: -2, width: 5, height: 5, background: 'var(--yap-crimson)' }}/>
          </div>
          <span className="disp" style={{ fontSize: 22 }}>Yap / Market</span>
        </div>
        <nav style={{ display: 'flex', gap: 28 }}>
          {['Arenas','Mint','Vault','Market','Leaderboard'].map(x =>
            <a key={x} href="#" style={{
              fontFamily: 'var(--yap-font-mono)', fontSize: 11, letterSpacing: 2,
              textTransform: 'uppercase', color: x === 'Market' ? 'var(--yap-ink-50)' : 'var(--yap-ink-300)', textDecoration: 'none'
            }}>{x}</a>)}
        </nav>
        <button className="btn btn--ghost btn--sm">
          <Icon.Wallet/> 0x1d4D…c485D
        </button>
      </header>

      <VolumeStrip/>

      <section style={{ padding: '32px 56px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <div className="cap" style={{ color: 'var(--yap-crimson)', marginBottom: 6 }}>━━ The fight card</div>
            <h1 className="disp" style={{ fontSize: 64, margin: 0, lineHeight: 0.9 }}>Pick a fighter.<br/>Take their corner.</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--ghost btn--sm"><Icon.Plus/> List a fighter</button>
            <button className="btn btn--gold btn--sm">My listings</button>
          </div>
        </div>
        <MarketTabs active="fighters"/>
      </section>

      <section style={{ padding: '20px 56px 18px' }}>
        <FilterBar/>
      </section>

      <section style={{ padding: '4px 56px 32px', flex: 1, overflow: 'hidden' }}>
        <FighterGrid/>
      </section>
    </div>
  );
}

function MarketMobile() {
  return (
    <div className="yap-surface" style={{ width: 375, height: 812, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: '1px solid var(--yap-ink-700)'
      }}>
        <span className="disp" style={{ fontSize: 18 }}>Yap / Market</span>
        <button className="btn btn--ghost btn--sm">0x1d…D</button>
      </header>
      <VolumeStrip compact/>
      <div style={{ padding: '16px 18px 8px' }}>
        <h1 className="disp" style={{ fontSize: 32, margin: '0 0 12px', lineHeight: 0.9 }}>Pick a<br/>fighter.</h1>
        <MarketTabs active="fighters" compact/>
      </div>
      <div style={{ padding: '12px 18px' }}>
        <FilterBar compact/>
      </div>
      <div style={{ padding: '4px 18px 18px', flex: 1, overflow: 'hidden' }}>
        <FighterGrid compact/>
      </div>
    </div>
  );
}

function MarketNotes() {
  return (
    <Notes
      title="04 · Marketplace"
      summary="Browse-buy surface. Volume strip top, then a tabbed gallery. Cards vary on hover (lift + crimson border) so the grid never feels uniform — Tape badges on rare/edition entries break the rhythm further."
      components={[
        "<b>Tabs</b> — Fighters · Moments. Display Anton 28 caps with mono count beside. Underline animates left/right on switch.",
        "<b>Filter bar</b> — search input + Mono numeric min/max + archetype select + sort. Mono labels above each.",
        "<b>Fighter card</b> — Sigil + Anton name + archetype small mono caps. Body row: Record badge + ELO mono + streak Punch icon (crimson when on streak).",
        "<b>Footer row</b> — Split badge (gold) <code>Buy / 4.20 OG</code> + sm Voltage btn <code>Bid →</code>.",
        "<b>Tape badge</b> — top-right corner when the fighter has an attribute (1st Edition / Top 10 / Hot Streak). Rotates -1.5° by default.",
        "<b>Volume strip</b> — full-bleed under nav: 24h vol / listings / floor as Split badges + tape <code>Top earner</code>.",
        "<b>Empty state (not shown)</b> — \"No fighters listed. The next one's yours.\" + Voltage <code>Mint a fighter</code> btn.",
      ]}
      motion={[
        "<b>Tab switch</b> — underline morphs across tabs in 240ms ease-out. Grid contents cross-fade 240ms.",
        "<b>Card hover</b> — translateY -4px + border crimson + Tape badge tilts -3°. 240ms ease-out. (No 1.05 scale.)",
        "<b>Sort/filter apply</b> — grid items stagger-rebuild, 60ms between, total 420ms.",
        "<b>FLIP entry</b> — clicking a card morphs its Sigil into the detail page hero (shared element, 420ms ease-out).",
        "<b>Bid press</b> — button press scale 0.98 → 1; on success a Stamp <code>BID PLACED</code> overshoots top-right (420ms ease-punch).",
      ]}
    />
  );
}

Object.assign(window, { MarketDesktop, MarketMobile, MarketNotes });
