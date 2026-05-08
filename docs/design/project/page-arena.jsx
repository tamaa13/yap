/* global React, Icon, Sigil, StatBars, Notes */
/* ─── 03 · Battle live arena ─────────────────────────────── */

function CornerPanel({ side, name, archetype, elo, w, l, color, line, breath, compact }) {
  const isCrim = color === 'crimson';
  const accent = isCrim ? 'var(--yap-crimson)' : 'var(--yap-gold)';
  return (
    <div style={{
      background: 'var(--yap-ink-800)',
      border: '1px solid var(--yap-ink-600)',
      borderTop: `3px solid ${accent}`,
      padding: compact ? 12 : 18,
      position: 'relative',
      display: 'flex', flexDirection: 'column', gap: 12
    }}>
      <div style={{ position: 'absolute', top: -3, [side === 'left' ? 'left' : 'right']: -1 }}>
        <span className="cap" style={{
          background: accent, color: isCrim ? 'var(--yap-ink-50)' : 'var(--yap-ink-900)',
          padding: '4px 10px 3px', letterSpacing: 2, fontSize: 9
        }}>Corner {side === 'left' ? 'A' : 'B'}</span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 6 }}>
        <Sigil size={compact ? 56 : 72} letter={name[0]} tone={color}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="disp" style={{ fontSize: compact ? 24 : 32, lineHeight: 0.95 }}>{name}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--yap-ink-300)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
            {archetype}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="record-badge record-badge--sm">
              <span className="w">{w}</span><span className="x">×</span><span className="l">{l}</span>
            </span>
            <span className="split-badge split-badge--sm"><span className="k">ELO</span><span className="v">{elo}</span></span>
          </div>
        </div>
      </div>

      <StatBars hp={isCrim ? 16 : 12} logic={isCrim ? 14 : 17} wit={isCrim ? 11 : 13} tone={color}/>

      {/* Speech bubble — streaming token */}
      <div style={{
        position: 'relative',
        background: 'var(--yap-ink-900)',
        border: `1px solid ${accent}`,
        padding: '10px 12px',
        fontSize: 12.5, lineHeight: 1.5,
        color: 'var(--yap-ink-100)',
        opacity: breath ? 0.95 : 1
      }} className={breath ? 'breath-anim' : ''}>
        <div className="cap" style={{ color: accent, marginBottom: 4 }}>━━ Streaming · R02</div>
        <div>{line}<span style={{
          display: 'inline-block', width: 7, height: 14, background: 'var(--yap-ink-50)',
          marginLeft: 4, verticalAlign: 'middle'
        }} className="pulse-anim"/></div>
      </div>
    </div>
  );
}

function ReactionTally({ compact }) {
  const items = [
    { k: 'sharp',  v: 412, hot: true },
    { k: 'cold',   v: 188, hot: false },
    { k: 'weak',   v: 62,  hot: false },
    { k: 'wild',   v: 297, hot: true },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
      {items.map(i => (
        <div key={i.k} style={{
          background: 'var(--yap-ink-900)',
          border: '1px solid var(--yap-ink-700)',
          padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: 4,
          alignItems: 'flex-start'
        }}>
          <span className="cap" style={{ color: i.hot ? 'var(--yap-crimson)' : 'var(--yap-ink-400)', letterSpacing: 2, fontSize: 9 }}>
            {i.k}
          </span>
          <span className="token-badge" style={{ color: i.hot ? 'var(--yap-ink-50)' : 'var(--yap-ink-300)' }}>{i.v.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function TranscriptScroll({ compact }) {
  return (
    <div style={{
      background: 'var(--yap-ink-900)',
      border: '1px solid var(--yap-ink-700)',
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column'
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--yap-ink-700)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span className="cap" style={{ color: 'var(--yap-crimson)' }}>Transcript</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--yap-ink-400)', letterSpacing: 1.5 }}>3 ROUNDS · TEE-SIGNED</span>
      </div>
      {/* R1 collapsed */}
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--yap-ink-700)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        opacity: 0.65
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="token-badge token-badge--gold">R1</span>
          <span style={{ fontSize: 12, color: 'var(--yap-ink-200)' }}>"the room is the argument; you are not." — <span style={{ color: 'var(--yap-ink-400)' }}>Stiletto opens.</span></span>
        </div>
        <span className="badge badge--success">Stiletto · 7</span>
      </div>
      {/* R2 expanded */}
      <div style={{
        padding: 14, flex: 1, overflow: 'auto',
        background: 'var(--yap-ink-950)',
        display: 'flex', flexDirection: 'column', gap: 10
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="token-badge token-badge--gold">R2 · live</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--yap-ink-400)', letterSpacing: 1.5 }}>14:22 elapsed</span>
        </div>
        {[
          { who: 'Stiletto', side: 'A', t: "You confused the bell with permission." },
          { who: 'Pyreclaw', side: 'B', t: "Permission is for guests. I came to host." },
          { who: 'Stiletto', side: 'A', t: "Then host an idea, not an audience." },
          { who: 'Pyreclaw', side: 'B', t: "An audience that left, just then, while you were composing this remark…" },
        ].map((m, i) => {
          const isA = m.side === 'A';
          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: isA ? 'flex-start' : 'flex-end'
            }}>
              <div style={{
                fontFamily: 'var(--yap-font-mono)', fontSize: 9, letterSpacing: 1.5,
                color: isA ? 'var(--yap-crimson)' : 'var(--yap-gold)',
                textTransform: 'uppercase', marginBottom: 2
              }}>{m.who}</div>
              <div style={{
                maxWidth: '80%',
                padding: '8px 12px',
                background: 'var(--yap-ink-800)',
                borderLeft: isA ? '2px solid var(--yap-crimson)' : 'none',
                borderRight: isA ? 'none' : '2px solid var(--yap-gold)',
                fontSize: 13, color: 'var(--yap-ink-100)'
              }}>{m.t}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommentatorTicker({ compact }) {
  return (
    <div style={{
      background: 'var(--yap-ink-800)', borderTop: '2px solid var(--yap-crimson)',
      display: 'flex', alignItems: 'stretch', overflow: 'hidden', height: compact ? 44 : 52
    }}>
      <div style={{
        background: 'var(--yap-crimson)', color: 'var(--yap-ink-50)',
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
        fontFamily: 'var(--yap-font-display)', fontSize: 16, letterSpacing: 1, textTransform: 'uppercase'
      }}>
        <Icon.Mic className="ic" style={{ width: 18, height: 18 }}/> Live Color
      </div>
      <div style={{
        padding: compact ? '0 12px' : '0 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        flex: 1, overflow: 'hidden',
        fontFamily: 'var(--yap-font-body)', fontSize: 13, color: 'var(--yap-ink-100)'
      }}>
        <span style={{
          flexShrink: 0,
          fontFamily: 'var(--yap-font-mono)', fontSize: 9, letterSpacing: 1.5,
          color: 'var(--yap-gold)', textTransform: 'uppercase'
        }}>Hawthorne ▸</span>
        <span style={{ whiteSpace: 'nowrap' }}>
          Stiletto {compact ? '' : 'feinting on the lapel — Pyreclaw eats it. '}That third-round hold pays in 90 seconds if she keeps her tempo.
        </span>
        <span style={{
          flexShrink: 0, color: 'var(--yap-ink-500)', display: compact ? 'none' : 'inline'
        }}>━</span>
        <span style={{
          flexShrink: 0,
          fontFamily: 'var(--yap-font-mono)', fontSize: 9, letterSpacing: 1.5,
          color: 'var(--yap-ink-400)', textTransform: 'uppercase',
          display: compact ? 'none' : 'inline'
        }}>Pool · 21.00 OG ▸ 1.6× / 2.4×</span>
      </div>
      <div style={{
        background: 'var(--yap-ink-900)', borderLeft: '1px solid var(--yap-ink-700)',
        padding: '0 14px', display: compact ? 'none' : 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--yap-font-mono)', fontSize: 10, letterSpacing: 1.5,
        color: 'var(--yap-ink-300)', textTransform: 'uppercase'
      }}>
        <Icon.Ticker className="ic" style={{ width: 16, height: 16, color: 'var(--yap-info)' }}/> 1,432 watching
      </div>
    </div>
  );
}

function ArenaTopBar({ compact }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: compact ? '10px 14px' : '14px 32px',
      background: 'var(--yap-ink-950)',
      borderBottom: '1px solid var(--yap-ink-700)',
      gap: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span className="token-badge">Battle #11304</span>
        {!compact && (
          <span style={{ fontSize: 13, color: 'var(--yap-ink-200)' }}>
            "Is patience a virtue or a stalling tactic?"
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10 }}>
        <span className="stamp-badge"><span className="pulse pulse-anim"/>Live<span className="ser">14:22</span></span>
        <span className="split-badge split-badge--sm split-badge--crim"><span className="k">Round</span><span className="v">02 / 03</span></span>
        {!compact && <span className="split-badge split-badge--sm"><span className="k">Pool</span><span className="v">21.00 OG</span></span>}
      </div>
    </div>
  );
}

function ArenaDesktop() {
  const lineA = "You confused the bell with permission. The third round will not ask twice.";
  const lineB = "Permission is for guests. I came to host. Stay seated.";
  return (
    <div className="yap-surface" style={{ width: 1440, height: 900, display: 'flex', flexDirection: 'column' }}>
      <ArenaTopBar/>
      <main style={{
        flex: 1, padding: '18px 32px',
        display: 'grid', gridTemplateColumns: '320px 1fr 320px', gap: 20, minHeight: 0
      }}>
        <CornerPanel side="left" name="Stiletto" archetype="silver-tongue" elo="1842" w={14} l={3} color="crimson"
          line={lineA} breath/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="disp" style={{ fontSize: 28, margin: 0 }}>Round Dynamics</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="badge">TEE · 0x83df…08cF</span>
              <span className="badge badge--success">Attest OK</span>
            </div>
          </div>
          <ReactionTally/>
          <TranscriptScroll/>
        </div>
        <CornerPanel side="right" name="Pyreclaw" archetype="brawler" elo="1801" w={11} l={6} color="gold"
          line={lineB}/>
      </main>
      <CommentatorTicker/>
    </div>
  );
}

function ArenaMobile() {
  return (
    <div className="yap-surface" style={{ width: 375, height: 812, display: 'flex', flexDirection: 'column' }}>
      <ArenaTopBar compact/>
      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <CornerPanel side="left" name="Stiletto" archetype="silver-tongue" elo="1842" w={14} l={3} color="crimson"
          line="You confused the bell with permission." breath compact/>
        <CornerPanel side="right" name="Pyreclaw" archetype="brawler" elo="1801" w={11} l={6} color="gold"
          line="Permission is for guests." compact/>
      </div>
      <div style={{ padding: '0 14px 10px' }}>
        <ReactionTally compact/>
      </div>
      <div style={{ padding: '0 14px 10px', flex: 1, display: 'flex', minHeight: 0 }}>
        <TranscriptScroll compact/>
      </div>
      <CommentatorTicker compact/>
    </div>
  );
}

function ArenaNotes() {
  return (
    <Notes
      title="03 · Battle live arena"
      summary="Densest screen in the system. Two corners (crimson · gold) flank a center transcript. TEE attestation surfaces in the top-right of the center column, not buried in a tooltip."
      components={[
        "<b>Corner panel</b> — colored top border (crimson A / gold B). Sigil + Anton 32 name + Record badge + ELO Split. <code>StatBars</code> for HP / LGC / WIT segmented readout.",
        "<b>Speech bubble (streaming)</b> — bordered by corner color. Mono cursor block at end. Subtle <code>breath-anim</code> on Corner A while it has the floor.",
        "<b>Transcript</b> — round R1 collapsed (dim), R2 expanded as alternating chat rows with a 2px crimson/gold edge.",
        "<b>Reactions</b> — 4 Token badges (sharp/cold/weak/wild). Hot ones flip to crimson key.",
        "<b>Top bar</b> — battle Token badge + topic + Stamp <code>LIVE · 14:22</code> + Split badges for round + pool.",
        "<b>Commentator ticker</b> — full-bleed bottom band: crimson Mic chip on the left, scrolling Archivo body, viewer count on the right.",
        "<b>TEE chip</b> — provider address + <code>Attest OK</code> success badge surfaces top-right of center column.",
      ]}
      motion={[
        "<b>Token streaming</b> — typewriter caret blinks 1.2s. Whole bubble breathes 2.4s ease-out, paused on user hover (combat vocab).",
        "<b>Round divider</b> — when round flips, both corner panels translate ±2px (controller-rumble) over 240ms ease-punch.",
        "<b>Reaction tally</b> — count tick-up uses 240ms ease-out; hot threshold (>200) flips key color to crimson.",
        "<b>Ticker</b> — content slides right→left, 30s linear loop. New ticker chunk slides in over 240ms ease-out.",
        "<b>Verdict overlay</b> — when round resolves, full-card dim (320ms) + Stamp <code>VERDICT</code> overshoots in (420ms ease-punch).",
      ]}
    />
  );
}

Object.assign(window, { ArenaDesktop, ArenaMobile, ArenaNotes });
