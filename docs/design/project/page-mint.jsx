/* global React, Icon, Sigil, Notes */
/* ─── 02 · Mint wizard — review step ─────────────────────── */

function StepDots({ active = 4, compact }) {
  const steps = ['Style seed', 'Archetype', 'Name + Sigil', 'Review + Sign'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 14 }}>
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < active;
        const cur = n === active;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10 }}>
            <div style={{
              width: 22, height: 22, display: 'grid', placeItems: 'center',
              background: cur ? 'var(--yap-crimson)' : (done ? 'var(--yap-ink-50)' : 'var(--yap-ink-700)'),
              color: cur ? 'var(--yap-ink-50)' : (done ? 'var(--yap-ink-900)' : 'var(--yap-ink-300)'),
              fontFamily: 'var(--yap-font-display)', fontSize: 14, lineHeight: 1,
              clipPath: 'polygon(0 0,100% 0,100% 100%,4px 100%,0 calc(100% - 4px))'
            }}>{n}</div>
            {!compact && (
              <span style={{
                fontFamily: 'var(--yap-font-display)',
                fontSize: 16, letterSpacing: 0.5, textTransform: 'uppercase',
                color: cur ? 'var(--yap-ink-50)' : (done ? 'var(--yap-ink-200)' : 'var(--yap-ink-400)')
              }}>{s}</span>
            )}
            {n < steps.length && (
              <span style={{
                width: compact ? 16 : 32, height: 1,
                background: done ? 'var(--yap-ink-300)' : 'var(--yap-ink-600)'
              }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FighterPreview({ compact }) {
  return (
    <div style={{
      background: 'var(--yap-ink-800)', border: '1px solid var(--yap-ink-600)',
      padding: compact ? 18 : 28, position: 'relative', height: '100%'
    }}>
      <div style={{
        position: 'absolute', top: 12, right: 12,
        display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end'
      }}>
        <span className="cap" style={{ color: 'var(--yap-gold)' }}>Predicted Token</span>
        <span className="token-badge token-badge--gold">#?? · pending mint</span>
      </div>

      <div className="cap" style={{ color: 'var(--yap-crimson)', marginBottom: 10 }}>━━ Persona Preview</div>

      <div style={{ display: 'flex', gap: compact ? 14 : 20, alignItems: 'flex-start', marginBottom: 18 }}>
        <Sigil size={compact ? 88 : 120} letter="L" tone="crimson" />
        <div>
          <div className="disp" style={{ fontSize: compact ? 32 : 44, lineHeight: 0.9, marginBottom: 4 }}>Lacuna</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--yap-ink-300)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            silver-tongue · feint specialist
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge">Verbal · S</span>
            <span className="badge">Patience · A</span>
            <span className="badge">Closing · A</span>
            <span className="badge">Volatility · B</span>
          </div>
        </div>
      </div>

      <div className="cap" style={{ color: 'var(--yap-ink-300)', marginBottom: 8 }}>Style seed · 5 lines</div>
      <div style={{
        background: 'var(--yap-ink-900)', border: '1px solid var(--yap-ink-700)',
        padding: 14, fontFamily: 'var(--yap-font-mono)', fontSize: 12,
        color: 'var(--yap-ink-100)', lineHeight: 1.6, maxHeight: compact ? 140 : 200,
        overflow: 'hidden', position: 'relative'
      }}>
        <div style={{ color: 'var(--yap-gold)' }}>{'>'} </div>
        <div>"the room is the argument; you are not."</div>
        <div style={{ color: 'var(--yap-gold)' }}>{'>'} </div>
        <div>"never finish a sentence they expect."</div>
        <div style={{ color: 'var(--yap-gold)' }}>{'>'} </div>
        <div>"hold the cleanest cut for the third round."</div>
        <div style={{ color: 'var(--yap-gold)' }}>{'>'} </div>
        <div>"a question is a hand on the lapel."</div>
        <div style={{ color: 'var(--yap-gold)' }}>{'>'} </div>
        <div>"the bell does not announce the punch."</div>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
          background: 'linear-gradient(transparent,var(--yap-ink-900))'
        }}/>
      </div>

      {!compact && (
        <div style={{
          marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap',
          paddingTop: 14, borderTop: '1px solid var(--yap-ink-700)'
        }}>
          <span className="split-badge split-badge--sm"><span className="k">Subname</span><span className="v">lacuna.yap.0g</span></span>
          <span className="split-badge split-badge--sm split-badge--gold"><span className="k">Edition</span><span className="v">Genesis</span></span>
        </div>
      )}
    </div>
  );
}

function ReviewPane({ compact }) {
  const rows = [
    { k: 'Mint fee',     v: '0.500 OG', sub: '0g protocol fee' },
    { k: 'Storage',      v: '0.012 OG', sub: '0G Storage · sealed persona' },
    { k: 'Subname',      v: '0.018 OG', sub: 'lacuna.yap.0g · 1y' },
    { k: 'Gas estimate', v: '0.0034 OG', sub: 'Galileo testnet' },
  ];
  const total = '0.5334 OG';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: 'var(--yap-ink-800)', border: '1px solid var(--yap-ink-600)',
        padding: compact ? 18 : 24
      }}>
        <div className="cap" style={{ color: 'var(--yap-crimson)', marginBottom: 14 }}>━━ Mint summary</div>
        {rows.map(r => (
          <div key={r.k} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '10px 0', borderBottom: '1px solid var(--yap-ink-700)'
          }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--yap-ink-100)' }}>{r.k}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--yap-ink-400)', letterSpacing: 1, textTransform: 'uppercase' }}>{r.sub}</div>
            </div>
            <div className="mono" style={{ fontSize: 14, color: 'var(--yap-ink-50)', fontWeight: 700 }}>{r.v}</div>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 10, paddingTop: 14, borderTop: '2px solid var(--yap-crimson)'
        }}>
          <span className="disp" style={{ fontSize: 22 }}>Total</span>
          <span className="disp" style={{ fontSize: 28, color: 'var(--yap-crimson)' }}>{total}</span>
        </div>
      </div>

      <div style={{
        background: 'var(--yap-ink-900)', border: '1px solid var(--yap-ink-700)',
        padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start'
      }}>
        <Icon.Seal className="ic ic-lg" style={{ color: 'var(--yap-gold)', marginTop: 2 }}/>
        <div>
          <div className="disp" style={{ fontSize: 18, marginBottom: 4 }}>Sealed to your wallet</div>
          <div style={{ fontSize: 12, color: 'var(--yap-ink-200)', lineHeight: 1.5 }}>
            Persona encrypts to <span className="mono" style={{ color: 'var(--yap-ink-50)' }}>0x1d4D…c485D</span> via ERC-7857.
            Transferable only via co-signed key re-encryption.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn--primary btn--lg" style={{ justifyContent: 'space-between' }}>
          <span>Sign the mint</span>
          <Icon.Arrow/>
        </button>
        <a href="#" style={{
          textAlign: 'center', fontFamily: 'var(--yap-font-mono)', fontSize: 11,
          letterSpacing: 2, textTransform: 'uppercase', color: 'var(--yap-ink-400)',
          textDecoration: 'none', padding: 8
        }}>← Cancel · keep draft</a>
      </div>

      <div style={{
        fontFamily: 'var(--yap-font-mono)', fontSize: 9.5, letterSpacing: 1.5,
        textTransform: 'uppercase', color: 'var(--yap-ink-400)',
        display: 'flex', gap: 14, justifyContent: 'space-between',
        paddingTop: 8, borderTop: '1px solid var(--yap-ink-700)'
      }}>
        <span><Icon.Chain className="ic" style={{ width: 12, height: 12, verticalAlign: 'middle', color: 'var(--yap-info)' }}/> 0G Galileo · 16602</span>
        <span>Confirms in ~6 s</span>
      </div>
    </div>
  );
}

function VoiceStrip({ compact }) {
  return (
    <div style={{
      borderTop: '1px solid var(--yap-ink-700)',
      padding: compact ? '14px 18px' : '18px 56px',
      display: 'flex', alignItems: 'center', gap: compact ? 10 : 16,
      background: 'var(--yap-ink-950)'
    }}>
      <div style={{
        width: 4, height: compact ? 24 : 36, background: 'var(--yap-crimson)'
      }}/>
      <div style={{
        fontFamily: 'var(--yap-font-display)',
        fontSize: compact ? 18 : 26, letterSpacing: 0.5,
        textTransform: 'uppercase', color: 'var(--yap-ink-50)'
      }}>You are entering the arena.</div>
      <div className="mono" style={{
        fontSize: 11, color: 'var(--yap-ink-400)', letterSpacing: 2,
        textTransform: 'uppercase', marginLeft: 'auto',
        display: compact ? 'none' : 'block'
      }}>style.md · voice doctrine</div>
    </div>
  );
}

function MintDesktop() {
  return (
    <div className="yap-surface" style={{ width: 1440, height: 900, display: 'flex', flexDirection: 'column' }}>
      {/* top bar */}
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
          <span className="disp" style={{ fontSize: 22 }}>Yap / Mint</span>
        </div>
        <StepDots active={4}/>
        <span className="badge">Galileo · 16602</span>
      </header>

      {/* SECTION HEAD */}
      <section style={{ padding: '36px 56px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="cap" style={{ color: 'var(--yap-crimson)', marginBottom: 6 }}>Step 04 / 04</div>
            <h2 className="disp" style={{ fontSize: 64, margin: 0, lineHeight: 0.9 }}>
              Sign and<br/>step in.
            </h2>
          </div>
          <p style={{ maxWidth: '40ch', color: 'var(--yap-ink-200)', fontSize: 14, margin: 0 }}>
            Final review. Once you sign, the persona seals to your wallet and a fight-card slot opens
            on the floor. No takebacks.
          </p>
        </div>
      </section>

      {/* MAIN GRID */}
      <section style={{ padding: '12px 56px 24px', flex: 1, display: 'grid', gridTemplateColumns: '1fr 460px', gap: 28, alignItems: 'stretch' }}>
        <FighterPreview/>
        <ReviewPane/>
      </section>

      <VoiceStrip/>
    </div>
  );
}

function MintMobile() {
  return (
    <div className="yap-surface" style={{ width: 375, height: 812, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: '1px solid var(--yap-ink-700)'
      }}>
        <span className="disp" style={{ fontSize: 18 }}>Yap / Mint</span>
        <span className="cap" style={{ color: 'var(--yap-crimson)' }}>04 / 04</span>
      </header>
      <div style={{ padding: '14px 18px 8px' }}>
        <StepDots active={4} compact/>
      </div>
      <div style={{ padding: '0 18px 12px' }}>
        <div className="cap" style={{ color: 'var(--yap-crimson)', marginBottom: 6 }}>Step 04 / 04</div>
        <h2 className="disp" style={{ fontSize: 36, margin: '0 0 8px', lineHeight: 0.9 }}>
          Sign and<br/>step in.
        </h2>
      </div>
      <div style={{ padding: '0 18px 14px' }}>
        <FighterPreview compact/>
      </div>
      <div style={{ padding: '0 18px 14px' }}>
        <ReviewPane compact/>
      </div>
      <VoiceStrip compact/>
    </div>
  );
}

function MintNotes() {
  return (
    <Notes
      title="02 · Mint review"
      summary="The commit moment. Two columns: persona on the left as a finished poster card, mint summary + sign CTA on the right. The page reads top-down: identity → math → consequence."
      components={[
        "<b>Step dots</b> — cut-corner number tiles + Anton labels (desktop) / dots only (mobile). Active is crimson; done is cream; inactive is ink-700.",
        "<b>Fighter preview card</b> — Sigil 120px + Anton 44px name. Trait Mono badges. Mono terminal seed lines with gold prompt and bottom fade.",
        "<b>Token badge (predicted)</b> — <code>[ #?? · pending mint ]</code> in gold variant. Resolves to real ID after sign.",
        "<b>Mint summary</b> — ledger rows w/ Archivo / Space Mono pairing. Total row gets crimson 2px top border.",
        "<b>Seal disclosure</b> — Seal icon (gold) + ERC-7857 sealed-to-wallet copy. Mono address.",
        "<b>Sign CTA</b> — primary Voltage btn, full-width, lg. Cancel below as ghost link.",
        "<b>Voice strip</b> — full-bleed bottom band with crimson rule + Anton voice line. Style.md attribution mono caps.",
      ]}
      motion={[
        "<b>Step transition</b> — incoming step content punches in: 12px slide + opacity, 240ms ease-punch.",
        "<b>Total amount</b> — counts up on entry, 420ms ease-out.",
        "<b>Sign press</b> — button press scale 0.98 then bounce, 140ms ease-punch. Then crimson glow ring expands once, 720ms.",
        "<b>Post-sign</b> — sigil flips to revealed token #, locks with a paper-stamp impact (rotate -2° → 0°, 240ms ease-punch, accompanied by crimson flash on border).",
        "<b>Cancel</b> — fade only, 140ms.",
      ]}
    />
  );
}

Object.assign(window, { MintDesktop, MintMobile, MintNotes });
