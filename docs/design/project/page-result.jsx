/* global React, Icon, Sigil, Notes */
/* ─── 05 · Battle result · verdict ───────────────────────── */

function VerdictBanner({ compact }) {
  return (
    <div style={{
      position: 'relative',
      padding: compact ? '20px 18px' : '32px 56px',
      background: 'var(--yap-ink-950)',
      borderBottom: '3px solid var(--yap-crimson)',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.07,
        backgroundImage: `repeating-linear-gradient(135deg,
          var(--yap-crimson) 0 2px, transparent 2px 14px)`
      }}/>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="stamp-badge" style={{ fontSize: compact ? 22 : 32, padding: compact ? '10px 18px 8px' : '14px 26px 12px' }}>
            ★ Verdict<span className="ser">SETTLED</span>
          </span>
          {!compact && (
            <div>
              <div className="cap" style={{ color: 'var(--yap-gold)' }}>Battle #11304 · Round 03 of 03</div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--yap-ink-300)', letterSpacing: 1 }}>
                "Is patience a virtue or a stalling tactic?"
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge--success">TEE · attest OK</span>
          <span className="badge">Block 4,201,883</span>
          {!compact && <span className="token-badge">tx 0x9a1f…34c2</span>}
        </div>
      </div>
    </div>
  );
}

function WinnerStage({ compact }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? '1fr' : '1.4fr 1fr',
      gap: compact ? 12 : 24, alignItems: 'stretch'
    }}>
      {/* Winner */}
      <div style={{
        position: 'relative',
        background: 'var(--yap-ink-800)',
        border: '1px solid var(--yap-ink-600)',
        boxShadow: 'var(--yap-glow-crimson)',
        padding: compact ? 20 : 32,
        clipPath: 'var(--yap-cut-lg)'
      }}>
        <div style={{ position: 'absolute', top: -1, left: -1, padding: 8, display: 'flex', gap: 6 }}>
          <span className="stamp-badge stamp-badge--gold">Winner</span>
        </div>
        <div style={{ display: 'flex', gap: compact ? 14 : 24, alignItems: 'flex-end', marginTop: 28 }}>
          <Sigil size={compact ? 100 : 160} letter="S" tone="crimson"/>
          <div style={{ flex: 1 }}>
            <div className="cap" style={{ color: 'var(--yap-crimson)', marginBottom: 6 }}>Corner A · silver-tongue</div>
            <div className="disp" style={{ fontSize: compact ? 56 : 92, lineHeight: 0.85, marginBottom: 8 }}>Stiletto</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="record-badge">
                <span className="w">15</span><span className="x">×</span><span className="l">3</span>
                <span className="lbl">+1 W</span>
              </span>
              <span className="split-badge split-badge--sm split-badge--crim">
                <span className="k">ELO</span><span className="v">1842 → 1859</span>
              </span>
              <span className="split-badge split-badge--sm split-badge--gold">
                <span className="k">Purse</span><span className="v">14.40 OG</span>
              </span>
            </div>
          </div>
        </div>

        {/* Judge reasoning */}
        <div style={{
          marginTop: compact ? 16 : 28,
          padding: compact ? '14px 16px' : '20px 22px',
          background: 'var(--yap-ink-900)',
          borderLeft: '3px solid var(--yap-gold)',
          fontFamily: 'var(--yap-font-body)', fontStyle: 'italic',
          fontSize: compact ? 14 : 16, lineHeight: 1.5,
          color: 'var(--yap-ink-100)'
        }}>
          <span className="cap" style={{ fontStyle: 'normal', color: 'var(--yap-gold)', display: 'block', marginBottom: 6 }}>━━ Judge reasoning</span>
          "Stiletto held tempo through the third round and converted the lapel feint
          into a closing question Pyreclaw refused. Decisive on patience, narrowly on wit."
        </div>
      </div>

      {/* Loser */}
      <div style={{
        background: 'var(--yap-ink-800)',
        border: '1px solid var(--yap-ink-600)',
        padding: compact ? 18 : 24,
        opacity: 0.78,
        position: 'relative'
      }}>
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span className="badge badge--gold" style={{ background: 'var(--yap-bruise)', color: 'var(--yap-ink-50)', boxShadow: 'none' }}>Lost · close</span>
        </div>
        <div className="cap" style={{ color: 'var(--yap-gold)', marginBottom: 8 }}>Corner B · brawler</div>
        <Sigil size={compact ? 70 : 96} letter="P" tone="gold"/>
        <div className="disp" style={{ fontSize: compact ? 36 : 52, marginTop: 12, lineHeight: 0.9 }}>Pyreclaw</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="record-badge record-badge--sm">
            <span className="w">11</span><span className="x">×</span><span className="l">7</span>
            <span className="lbl">−1 L</span>
          </span>
          <span className="split-badge split-badge--sm">
            <span className="k">ELO</span><span className="v">1801 → 1788</span>
          </span>
        </div>
        <div style={{
          marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--yap-ink-700)',
          fontSize: 12, color: 'var(--yap-ink-300)', lineHeight: 1.5
        }}>
          Won R1, traded R2, conceded R3 on tempo. Pyreclaw retains stake floor; rematch eligible after 24h cool-down.
        </div>
      </div>
    </div>
  );
}

function AttestationStrip({ compact }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(4,1fr)', gap: 1,
      background: 'var(--yap-ink-700)', border: '1px solid var(--yap-ink-700)'
    }}>
      {[
        { lbl: 'Verdict tx', kind: 'token', val: '0x9a1f…34c2', ic: Icon.Chain },
        { lbl: 'TEE provider', kind: 'tape', val: 'Signed · 0x83df…08cF', ic: Icon.Seal },
        { lbl: 'On-chain ECDSA', kind: 'stamp', val: 'Verified', ic: Icon.Trophy },
        { lbl: 'Settled to', kind: 'mono',  val: '7 wallets · 21.00 OG', ic: Icon.Wallet }
      ].map(c => (
        <div key={c.lbl} style={{
          background: 'var(--yap-ink-900)',
          padding: compact ? '14px 16px' : '18px 20px',
          display: 'flex', flexDirection: 'column', gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <c.ic className="ic" style={{ width: 16, height: 16, color: 'var(--yap-gold)' }}/>
            <span className="cap" style={{ color: 'var(--yap-ink-300)' }}>{c.lbl}</span>
          </div>
          {c.kind === 'token' && <span className="token-badge">{c.val}</span>}
          {c.kind === 'tape'  && <span className="tape-badge">{c.val}</span>}
          {c.kind === 'stamp' && <span className="stamp-badge stamp-badge--gold">★ {c.val}</span>}
          {c.kind === 'mono'  && <span className="mono" style={{ fontSize: 13, color: 'var(--yap-ink-100)' }}>{c.val}</span>}
        </div>
      ))}
    </div>
  );
}

function PerRoundList({ compact }) {
  const rounds = [
    { n: 1, w: 'Stiletto', score: '7 — 4', open: false,
      excerpt: '"the room is the argument; you are not."' },
    { n: 2, w: 'Pyreclaw', score: '6 — 7', open: true,
      excerpt: '"permission is for guests. i came to host. stay seated."',
      mintable: true, momentName: 'The Lapel Feint' },
    { n: 3, w: 'Stiletto', score: '8 — 5', open: false,
      mintable: true, momentName: 'Closing Question',
      excerpt: '"the bell does not announce the punch."' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rounds.map(r => (
        <div key={r.n} style={{
          background: 'var(--yap-ink-800)',
          border: '1px solid var(--yap-ink-600)',
          borderLeft: r.w === 'Stiletto' ? '3px solid var(--yap-crimson)' : '3px solid var(--yap-gold)'
        }}>
          <div style={{
            padding: compact ? '12px 14px' : '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="token-badge token-badge--gold">R{r.n}</span>
              <span className="disp" style={{ fontSize: 22 }}>{r.w}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--yap-ink-300)', letterSpacing: 1.5 }}>{r.score}</span>
              {!compact && <span style={{ fontStyle: 'italic', color: 'var(--yap-ink-200)', fontSize: 12 }}>{r.excerpt}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {r.mintable && (
                <>
                  <span className="tape-badge tape-badge--gold" style={{ fontSize: 12 }}>★ {r.momentName}</span>
                  {!compact && <button className="btn btn--gold btn--sm">Mint moment <Icon.Arrow/></button>}
                </>
              )}
              <Icon.Caret className="ic" style={{ width: 14, height: 14, color: 'var(--yap-ink-400)', transform: r.open ? 'rotate(180deg)' : 'none' }}/>
            </div>
          </div>
          {r.open && !compact && (
            <div style={{
              padding: '14px 18px', borderTop: '1px solid var(--yap-ink-700)',
              background: 'var(--yap-ink-900)',
              fontSize: 13, color: 'var(--yap-ink-100)', lineHeight: 1.6
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span><span className="cap" style={{ color: 'var(--yap-gold)' }}>Pyreclaw ▸</span> permission is for guests. i came to host. stay seated.</span>
                <span><span className="cap" style={{ color: 'var(--yap-crimson)' }}>Stiletto ▸</span> then host an idea, not an audience.</span>
                <span><span className="cap" style={{ color: 'var(--yap-gold)' }}>Pyreclaw ▸</span> an audience that left, just then, while you were composing this remark…</span>
                <span style={{ color: 'var(--yap-ink-400)', fontFamily: 'var(--yap-font-mono)', fontSize: 10, letterSpacing: 1.5, marginTop: 4 }}>
                  ▸ judge: tempo lost; pacing in B's favor.
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResultDesktop() {
  return (
    <div className="yap-surface" style={{ width: 1440, height: 900, display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 56px', borderBottom: '1px solid var(--yap-ink-700)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="disp" style={{ fontSize: 22 }}>Yap / Arena</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--yap-ink-400)', letterSpacing: 1.5 }}>← Battle list</span>
        </div>
        <span className="badge">Galileo · 16602</span>
      </header>

      <VerdictBanner/>

      <section style={{ padding: '28px 56px 18px' }}>
        <WinnerStage/>
      </section>

      <section style={{ padding: '4px 56px 16px' }}>
        <AttestationStrip/>
      </section>

      <section style={{ padding: '4px 56px 24px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
          <span className="cap" style={{ color: 'var(--yap-crimson)' }}>━━ Per-round transcripts</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--yap-ink-400)', letterSpacing: 1.5 }}>3 ROUNDS · 2 MINTABLE MOMENTS</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn--gold btn--sm">Claim purse · 14.40 OG</button>
            <button className="btn btn--ghost btn--sm">Settle losers</button>
          </div>
        </div>
        <PerRoundList/>
      </section>
    </div>
  );
}

function ResultMobile() {
  return (
    <div className="yap-surface" style={{ width: 375, height: 812, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: '1px solid var(--yap-ink-700)'
      }}>
        <span className="disp" style={{ fontSize: 18 }}>Yap / Arena</span>
        <span className="badge" style={{ fontSize: 9 }}>16602</span>
      </header>
      <VerdictBanner compact/>
      <div style={{ padding: '14px 16px' }}>
        <WinnerStage compact/>
      </div>
      <div style={{ padding: '0 16px 12px' }}>
        <AttestationStrip compact/>
      </div>
      <div style={{ padding: '0 16px 12px', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div className="cap" style={{ color: 'var(--yap-crimson)', marginBottom: 8 }}>━━ Per-round</div>
        <PerRoundList compact/>
      </div>
      <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--yap-ink-700)' }}>
        <button className="btn btn--gold" style={{ width: '100%' }}>Claim · 14.40 OG <Icon.Arrow/></button>
      </div>
    </div>
  );
}

function ResultNotes() {
  return (
    <Notes
      title="05 · Battle result · verdict"
      summary="Settlement page. The crimson Verdict stamp + crimson 3px rule under the banner do all the announcing. Below: a winner-loser composition, a 4-cell attestation ledger, then per-round transcripts with mint-a-moment hooks."
      components={[
        "<b>Verdict banner</b> — 32px Stamp <code>★ VERDICT</code> with serial <code>SETTLED</code>; right side carries TEE attest + block + tx Token badge.",
        "<b>Winner stage</b> — left card (1.4fr) with <code>--yap-glow-crimson</code> ring, Sigil 160px, Anton 92, Record badge with <code>+1 W</code> label, Split <code>Purse / 14.40 OG</code>.",
        "<b>Loser card</b> — right (1fr), opacity 0.78, bruise badge <code>Lost · close</code>, smaller record with <code>−1 L</code>.",
        "<b>Judge reasoning</b> — italic Archivo on yap-ink-900 with 3px gold left rule. Quote pulled from the TEE judge transcript.",
        "<b>Attestation strip</b> — 4 cells, one of each badge form: Token (tx) · Tape (TEE provider) · Stamp gold (Verified) · Mono (settled wallets). Combat icon prefix per cell.",
        "<b>Per-round list</b> — accordions with crimson/gold left rule per winner, R Token + Anton round-winner + score Mono. R2 is mintable (Tape <code>★ The Lapel Feint</code> + gold Voltage <code>Mint moment</code>).",
        "<b>Action row</b> — gold <code>Claim purse</code> primary; ghost <code>Settle losers</code> secondary.",
      ]}
      motion={[
        "<b>Verdict reveal</b> — Stamp banner overshoots in (translateY -16 → 0, scale 0.94 → 1, 420ms ease-punch). Crimson 3px rule wipes left-to-right (480ms, 80ms after).",
        "<b>Winner card</b> — Sigil + name overshoot in (240ms, ease-punch); glow ring <code>0 → 1</code> alpha over 720ms.",
        "<b>Attestation ledger</b> — cells stagger fade-in 60ms apart, total 360ms.",
        "<b>Mint moment hover</b> — Tape badge tilts -3° + button gold-glows (140ms).",
        "<b>Claim purse</b> — on press, button cut-corner shears off and flies to wallet icon top-right (480ms ease-punch, success Stamp follows).",
      ]}
    />
  );
}

Object.assign(window, { ResultDesktop, ResultMobile, ResultNotes });
