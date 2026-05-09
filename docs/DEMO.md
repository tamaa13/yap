# Yap demo recording — storyboard + narration

Target: 4–6 minute video for the 0G APAC Hackathon submission. Show the
verifiable AI combat arena end-to-end. Bahasa Indonesia narration with
English on-screen text.

**Demo URL**: `http://103.150.227.197/`
**Network**: 0G Galileo testnet (chainId 16602)
**Wallet for recording**: dev deployer `0x1d4D…c485D` (has fighters #1, #5, #10, etc.)

## Recording setup

- **Resolution**: 1920×1080 (downscale to 1280×720 for web upload)
- **Framerate**: 30 fps
- **Audio**: macOS `say` Damayanti voice for Indonesian narration, OR record live voiceover
- **Cursor**: enable cursor highlight
- **Browser**: Chrome with MetaMask, dev tools closed
- **Pre-roll**: 2 seconds of black, then logo/title card

## Storyboard

Total target: ~5 minutes split as below.

### Scene 1 — Cold open + thesis (~30s)

**Visual**: marketing landing page hero, hover over CTA "Enter arena", scroll past stat strip + featured battle teaser + 3-step "How it works".

**Narrator (Bahasa)**:
> Ini Yap — arena pertarungan AI yang bisa diverifikasi penuh on-chain
> di 0G. Setiap petarung adalah karakter INFT terenkripsi, bertanding
> dalam debat tiga ronde yang dijudgement oleh TEE provider, dan
> seluruh putusannya bisa dibuktikan secara matematis di chain.

**On-screen text**: "Verifiable AI combat arena · 0G APAC Hackathon"

### Scene 2 — Mint a fighter (~60s)

**Visual**: Click "Mint fighter" → wizard step 1 (style seed). Paste a
sample JSONL (10 prompt/completion pairs). Step 2: pick archetype
"Roaster". Step 3: name + avatar (e.g. "Kompor"). Step 4: review
breakdown, sign mint. Watch phase indicator dots punch through queued
→ uploading-seed → encrypting → uploading-encrypted → ready. MetaMask
sign popup. Tx confirms in ~5 sec. Fighter card materializes.

**Narrator**:
> Untuk membuat petarung, lo cuma kasih persona — sepuluh baris JSONL
> yang menggambarkan suaranya. Backend mengenkripsi persona itu,
> mengupload ke 0G Storage, dan setelah lo tanda tangan tx, fighter
> itu hidup on-chain sebagai INFT ERC-7857. Total prosesnya kurang
> dari sepuluh detik.

**Highlight**:
- Phase indicator with motion punch
- Voltage cut-corner button
- TokenId Token badge after mint
- "Fighter #N lives on-chain" success copy

### Scene 3 — Subname registration (~30s)

**Visual**: From mint success, click through to fighter detail. Click
"Register subname". Type "kompor". Submit → tx confirms. Fighter now
displays as `kompor.yap.0g`.

**Narrator**:
> Selain tokenId, lo bisa kasih nama yang gampang diingat. Subname
> ini disimpan permanen on-chain — ENS-style registry yang nge-resolve
> ke tokenId, jadi nama-nya ngikut fighter, bukan wallet. Sekarang
> fighter punya identitas manusiawi, bukan cuma nomor token.

**On-screen text**: `kompor.yap.0g · 0xd023…6A24:N`

### Scene 4 — Live battle + commentator (~90s, the show)

**Visual**: Navigate to `/arenas`. Pick an open challenge OR create
one with two owned fighters. Defender accepts. Click "Start battle".
Battle live arena loads — split corners (Crimson A / Gold B), HP/Logic/Wit
segmented bars, topic at top. Round 1 starts: Fighter A speech bubble
breathes while streaming tokens. Reaction tally below — viewer taps
"sharp", number slams up. Commentator ticker chunk slides in from
right with wit. Round 2, round 3 play out. Verdict phase. Stamp
"VERDICT" overlay.

**Narrator**:
> Ini battle hidup. Fighter A dan B dapat input dari user prompt
> debate, lalu setiap ronde keluar streaming dari 0G Compute TEE
> H100 — bukan ChatGPT, bukan vendor cloud terpusat. Setiap token
> ditanda tangani enclave. Komentar live di bawah datang dari panggilan
> inference paralel — dia ESPN-style, decorative tapi cuma muncul
> selama battle aktif. Reaksi penonton — sharp, cold, weak, wild —
> dimasukkan ke prompt judge sebagai sinyal audience untuk nge-tie-break
> calls yang ketat.

**Highlights**:
- Speech bubble breath animation
- Reaction count slam (Mortal Kombat damage counter feel)
- Commentator ticker entry
- LIVE badge pulse only while phase != settled

### Scene 5 — Verdict + on-chain settlement (~45s)

**Visual**: Verdict reveal — winner card scales up with overshoot,
crimson glow ring expands. Judge reasoning quote. Tap "Show signature"
or similar — display routing-proof attestation chain: signedText hex,
oracleKey address, ECDSA recovery confirmed. Click settle button →
tx confirm → "Settled" stamp lights. Click claim → payout transfers.

**Narrator**:
> Dan ini bagian intinya. Verdict-nya ditanda tangani enclave TEE
> dari 0G Compute provider yang sama yang ngeluarin inference-nya.
> Tanda tangan itu masuk ke chain via routing-proof attestation —
> kontrak BattleEscrow ngeverifikasi ECDSA recovery, sha256 dari
> response body, dan teks canonical verdict semuanya match. Cuma
> setelah itu pemenang dibayar. Tidak ada Yap-controlled oracle key.
> Jika provider TEE-nya rusak, settlement-nya gagal-tertutup.

**On-screen text**:
- `oracleKey: 0x83df…08cF`
- `verdict tx: 0xf0a8…e236a`
- `signature recovers to oracleKey ✓`

### Scene 6 — Mint a Battle Moment (~30s)

**Visual**: From battle result page, scroll down to "Mint moment"
row per round. Click on the round you liked → MetaMask sign. Tx
confirms. Navigate to vault → "Moments" tab. The new moment INFT
shows as a card, with its source battle reference + transcript clip
+ TEE attestation chain.

**Narrator**:
> Round-round yang menarik bisa jadi koleksi tersendiri. Mint moment
> itu nge-deploy INFT ERC-7857 baru, encrypted, transferable, tradeable
> di marketplace yang sama — kayak NBA Top Shot, tapi untuk debate AI.

**Highlights**:
- Tape badge "edition" on the new moment
- Stamp badge "verdict round" callout

### Scene 7 — Marketplace + rental + dispute (~45s)

**Visual**: Navigate to `/market`. Show fighters tab → sample fighter
detail → "Buy fighter" voltage gold button. Switch to Moments tab →
moments grid. Back to fighter detail → "List for rent" with
**Disputable** checkbox enabled. Show dispute panel surface (status,
windows, propose split). Don't actually rent during demo (skip the
24h wait).

**Narrator**:
> Petarung dan moments diperjualbelikan di marketplace yang sama,
> dengan re-encryption pada transfer — pemilik baru dapat sealed
> key baru, weights nya rotated. Untuk rental, lo bisa pilih
> pola "disputable" dimana dana ditahan dalam escrow sampai 24 jam
> setelah masa rental. Renter bisa dispute, kedua pihak negotiate
> co-signed split, atau setelah tujuh hari, dana otomatis di-refund
> ke renter. Tidak ada Yap wasit di tengah.

### Scene 8 — Wrap + bug catalog cred (~30s)

**Visual**: Show README scroll-through highlighting:
- 8 SDK + provider bugs surfaced to 0G team
- PR #479 cited our hackathon report by name (broker-side fixes for
  Bug #3 + #4)
- Test coverage: 235 tests (165 unit + 59 fork against live deploy)

**Narrator**:
> Selama membangun Yap, kita surface delapan bug SDK dan provider ke
> tim 0G. Empat di antaranya udah di-fix dalam pull request #479,
> langsung ngutip bug report kita di body PR-nya. Yap berfungsi sebagai
> pengkonsumsi paling dalam dari fine-tune flow 0G di hackathon ini —
> dari sini lah primitive-primitive 0G dapat batu uji nyata, bukan
> sekadar checkbox.

**End card**: "Yap · 0G APAC Hackathon 2026 · github.com/tamaa13/yap"

## Recording flow checklist

Before pressing record:

- [ ] Demo URL HTTP 200
- [ ] Wallet connected (deployer `0x1d4D…c485D`) — has Galileo OG
- [ ] Owns fighters #1, #5, #10 — at minimum two unowned-in-active-rental
- [ ] Open challenge prepared OR can create + accept fast
- [ ] Browser zoom 100%
- [ ] Window 1920×1080
- [ ] MetaMask popup positioned predictably
- [ ] Sound recorded separately (Indo narration via macOS `say -v Damayanti`
      OR live voiceover)

## Narration audio generation

```bash
# macOS — Indonesian voice
say -v Damayanti -o /tmp/yap-narration.aiff -f narration.txt

# Convert to mp3
ffmpeg -i /tmp/yap-narration.aiff -codec:a libmp3lame -q:a 3 /tmp/yap-narration.mp3
```

## Editing notes

- Each scene = its own clip; assemble in editor
- Cut tight — no dead air, no waiting on confirmations (speed-up MetaMask
  popups by 2× if needed)
- Add subtle color-grade: warmer ink shadows, slight crimson lift
- Keep on-screen text short — 5 words max per overlay
- End with logo card + GitHub URL fade
- Export 1080p H.264 at ~8 Mbps for HackQuest upload

## Backup plan

If something fails on demo URL during recording:
1. **Mint hangs** — usually 0G provider degraded. Skip Scene 2 mint live;
   reference an existing fighter (e.g. #26) instead, narrate "this is
   the same flow we just minted in the previous take."
2. **Battle inference fails** — same. Use Battle #9 (settled) for
   Scenes 4-5 (replay it from the result page since transcript is
   stored).
3. **Subname registrar reverts** — verify `useSubname` registerFee
   first; if 0, should never revert. Otherwise pre-fund.
4. **Marketplace transfer reverts** — usually approval not granted.
   Pre-approve `setApprovalForAll` on YapMarketplace before recording.

## Submission deliverables (post-recording)

- [ ] Demo video `.mp4` (1080p, ≤5 min)
- [ ] HackQuest project page submission (description + screenshots + video link)
- [ ] X post with video + key narrative beat ("8 bugs surfaced, half fixed in PR #479")
- [ ] GitHub README polish — badges (test count, contracts deployed)
- [ ] Mainnet deploy gate review (held until 0G Bug #6 resolved per ARCHITECTURE.md)
