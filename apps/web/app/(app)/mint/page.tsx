"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hash } from "@/components/ui/hash";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Sigil } from "@/components/ui/sigil";
import { Skel } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageContainer } from "@/components/shell/page-container";
import { GateScreen } from "@/components/wallet/gate-screen";
import { useMintFighter } from "@/hooks/use-mint-fighter";
import { useWallet } from "@/hooks/use-wallet";
import type { Archetype, FighterArchetype } from "@/lib/types";

const ARCHETYPES: Archetype[] = [
  { id: "roaster", name: "Roaster", blurb: "Burns quickly, burns bright.", stat: "Wit 92 · Logic 68" },
  { id: "debater", name: "Debater", blurb: "Structured argument, surgical rebuttals.", stat: "Logic 90 · Wit 70" },
  { id: "philosopher", name: "Philosopher", blurb: "First principles, long horizons.", stat: "Logic 95 · Patience 88" },
  { id: "troll", name: "Troll", blurb: "Unpredictable, derails the opponent.", stat: "Chaos 94 · Wit 80" },
  { id: "scholar", name: "Scholar", blurb: "Citation-heavy, precedent-driven.", stat: "Logic 88 · Memory 92" },
  { id: "provocateur", name: "Provocateur", blurb: "Goads with calculated edges.", stat: "Wit 86 · Chaos 78" },
];

const PHASE_LABELS: Record<string, string> = {
  seed: "Uploading seed to 0G Storage",
  training: "Fine-tuning on 0G Compute",
  encrypting: "Encrypting + storing weights",
  signing: "Waiting for wallet signature",
  minting: "Confirming mint on-chain",
  committing: "Saving fighter metadata",
};
const PHASE_ORDER = [
  "seed",
  "training",
  "encrypting",
  "signing",
  "minting",
  "committing",
] as const;

export default function MintPage() {
  const router = useRouter();
  const { push } = useToast();
  const { ready, connected, addr } = useWallet();
  const mint = useMintFighter();

  const [step, setStep] = useState(1);
  const [seedText, setSeedText] = useState("");
  const [seedFileName, setSeedFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [seedMode, setSeedMode] = useState<"simple" | "advanced">("simple");
  const [simpleLines, setSimpleLines] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [arch, setArch] = useState<FighterArchetype>("roaster");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(0);

  // Simple-mode: wrap user's free-text lines into JSONL that the backend expects.
  // Each non-empty line becomes one training example: the archetype provides the
  // prompt framing, the user's line becomes the completion.
  const simpleToJsonl = (lines: string, archetype: FighterArchetype) => {
    const promptByArch: Record<FighterArchetype, string> = {
      roaster: "Roast something in your usual style.",
      debater: "Argue your position on a debate topic.",
      philosopher: "Share a philosophical take.",
      troll: "Reply in your usual trolling style.",
      scholar: "Give a scholarly response.",
      provocateur: "Provoke a reaction with a sharp take.",
    };
    const prompt = promptByArch[archetype] ?? "Respond in character.";
    return lines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => JSON.stringify({ prompt, completion: line }))
      .join("\n");
  };

  // The text sent to /api/mint — always valid JSONL regardless of mode.
  const effectiveSeed =
    seedMode === "simple" ? simpleToJsonl(simpleLines, arch) : seedText;
  const effectiveSamples = effectiveSeed.split("\n").filter(Boolean).length;

  if (ready && !connected) {
    return <GateScreen action="the mint wizard" icon="zap" />;
  }

  const readFile = (file: File) => {
    setUploadError(null);
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB cap
    if (file.size > MAX_SIZE) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      return;
    }
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".jsonl") && !ext.endsWith(".txt") && !ext.endsWith(".json")) {
      setUploadError(`Unsupported file type. Use .jsonl, .json, or .txt.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      setSeedText(text.trim());
      setSeedFileName(file.name);
    };
    reader.onerror = () => setUploadError("Failed to read file.");
    reader.readAsText(file);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const clearFile = () => {
    setSeedText("");
    setSeedFileName(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const SAMPLE_SEED = `{"prompt":"What's the worst pizza topping?","completion":"Pineapple. It's a fruit wearing a witness protection disguise on your dinner."}
{"prompt":"Is cereal a soup?","completion":"Cereal isn't soup because soup has standards. Cereal is just milk on parole."}
{"prompt":"Coffee vs tea?","completion":"Tea is coffee's quiet cousin who reads poetry and judges you silently."}
{"prompt":"Android vs iPhone?","completion":"Android users have options. iPhone users have a personality brand they pay extra for."}
{"prompt":"Is a hot dog a sandwich?","completion":"A hot dog is a sandwich like a kayak is a canoe — technically, but you're being difficult on purpose."}
{"prompt":"What do you think of crypto?","completion":"Crypto is like owning a slot machine that explains itself with white papers."}
{"prompt":"AGI when?","completion":"AGI arrives right after full self-driving — which, coincidentally, also arrives next year forever."}
{"prompt":"Best programming language?","completion":"Rust enthusiasts will mention Rust before you ask. Go devs ship. JavaScript devs just keep showing up."}
{"prompt":"Remote vs office work?","completion":"Remote work is office work minus the traffic and plus a different kind of meeting fatigue."}
{"prompt":"Electric cars?","completion":"Electric cars are great — they solved range anxiety by replacing it with charging anxiety."}`;

  const loadSampleSeed = () => {
    setSeedText(SAMPLE_SEED);
    setSeedFileName("sample-roaster.jsonl");
    setUploadError(null);
  };

  const downloadSampleSeed = () => {
    const blob = new Blob([SAMPLE_SEED], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yap-sample-roaster.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  };

  const samples = effectiveSamples;
  const running = mint.phase !== "idle" && mint.phase !== "error";

  const runMint = async () => {
    if (!addr) return;
    try {
      const result = await mint.write({
        owner: addr,
        name: name || `Fighter #${Date.now().toString(36)}`,
        archetype: arch,
        avatar,
        styleSeed: effectiveSeed,
      });
      push({ kind: "success", text: `Fighter minted · #${result.tokenId}` });
      setTimeout(() => router.push(`/fighters/${result.tokenId}`), 1000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Mint failed",
      });
    }
  };

  const stepLabels = ["Style seed", "Archetype", "Name & avatar", "Review & mint"];

  return (
    <PageContainer maxWidth={920}>
      <Breadcrumbs items={[{ label: "Mint fighter" }]} />
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Mint fighter</h1>
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", marginBottom: 24 }}>
        Seal a style seed into a TEE-attested INFT on 0G.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {stepLabels.map((l, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: step >= i + 1 ? "var(--bg-surface)" : "var(--bg-sunken)",
              border: `1px solid ${step === i + 1 ? "var(--accent-border)" : "var(--bd-default)"}`,
              borderRadius: 4,
              fontSize: 12,
              color: step >= i + 1 ? "var(--tx-primary)" : "var(--tx-tertiary)",
            }}
          >
            <span
              className="mono"
              style={{
                color: step >= i + 1 ? "var(--accent)" : "var(--tx-tertiary)",
                marginRight: 8,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {l}
          </div>
        ))}
      </div>

      <Card style={{ padding: 24 }}>
        {step === 1 && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div className="label">Teach your fighter how to talk</div>
              <div
                style={{
                  display: "inline-flex",
                  border: "1px solid var(--bd-default)",
                  borderRadius: 4,
                  overflow: "hidden",
                  fontSize: 12,
                }}
              >
                {(["simple", "advanced"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSeedMode(m)}
                    style={{
                      padding: "6px 12px",
                      background:
                        seedMode === m ? "var(--bg-surface)" : "transparent",
                      color: seedMode === m ? "var(--tx-primary)" : "var(--tx-tertiary)",
                      border: "none",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {seedMode === "simple" && (
              <div>
                <div
                  style={{
                    padding: 14,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--bd-subtle)",
                    borderRadius: 4,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 13, color: "var(--tx-primary)", marginBottom: 6 }}>
                    Write 10+ lines in your fighter's voice
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--tx-secondary)",
                      lineHeight: 1.5,
                      marginBottom: 10,
                    }}
                  >
                    One line per example. Each line is a thing your fighter would say — a punchline,
                    hot take, debate zinger, or quip. Don't overthink formatting; we'll structure it
                    for training automatically based on your chosen archetype.
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--tx-tertiary)",
                      background: "var(--bg-sunken)",
                      padding: "10px 12px",
                      borderRadius: 3,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      marginBottom: 10,
                    }}
                  >
                    {`Pineapple on pizza is a fruit in witness protection.
Coffee built civilization; tea built poetry no one reads.
Crypto is a slot machine with footnotes.
…`}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSimpleLines(
                        [
                          "Pineapple on pizza is a fruit in witness protection.",
                          "Coffee built civilization; tea built poetry no one reads.",
                          "Crypto is a slot machine that explains itself with footnotes.",
                          "Remote work is office work minus traffic, plus new meeting fatigue.",
                          "Android users have options. iPhone users have a personality brand.",
                          "Cereal isn't soup. Soup has standards.",
                          "Self-driving cars arrive next year. Forever.",
                          "AGI is always five years out. Five years ago it was five years out.",
                          "Electric cars solved range anxiety by inventing charging anxiety.",
                          "A hot dog is a sandwich like a kayak is a canoe. You're being difficult.",
                        ].join("\n"),
                      );
                    }}
                    style={{
                      fontSize: 12,
                      padding: "6px 12px",
                      background: "var(--accent-muted)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent-border)",
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    Use sample (roaster)
                  </button>
                </div>

                <Textarea
                  value={simpleLines}
                  onChange={(e) => setSimpleLines(e.target.value)}
                  placeholder={`Type one line per example — just write how your fighter talks. E.g.\n\nPineapple on pizza is a fruit in witness protection.\nCoffee built civilization; tea built poetry no one reads.\n…`}
                  rows={10}
                  style={{ fontFamily: "var(--sans)" }}
                />
              </div>
            )}

            {seedMode === "advanced" && (
              <div>
                <div
                  style={{
                    padding: 14,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--bd-subtle)",
                    borderRadius: 4,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 13, color: "var(--tx-primary)", marginBottom: 6 }}>
                    JSONL format (power user)
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--tx-secondary)",
                      lineHeight: 1.5,
                      marginBottom: 10,
                    }}
                  >
                    Each line is{" "}
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        background: "var(--bg-sunken)",
                        padding: "1px 4px",
                        borderRadius: 2,
                      }}
                    >
                      {`{"prompt":"…","completion":"…"}`}
                    </code>
                    . Full control over prompt framing. Aim for 10+ pairs.
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--tx-tertiary)",
                      background: "var(--bg-sunken)",
                      padding: "10px 12px",
                      borderRadius: 3,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      marginBottom: 10,
                    }}
                  >
                    {`{"prompt":"What's the worst pizza topping?","completion":"Pineapple. A fruit in witness protection."}
{"prompt":"Is cereal a soup?","completion":"Soup has standards. Cereal is milk on parole."}
…`}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={loadSampleSeed}
                      style={{
                        fontSize: 12,
                        padding: "6px 12px",
                        background: "var(--accent-muted)",
                        color: "var(--accent)",
                        border: "1px solid var(--accent-border)",
                        borderRadius: 3,
                        cursor: "pointer",
                      }}
                    >
                      Use sample (roaster)
                    </button>
                    <button
                      type="button"
                      onClick={downloadSampleSeed}
                      style={{
                        fontSize: 12,
                        padding: "6px 12px",
                        background: "transparent",
                        color: "var(--tx-secondary)",
                        border: "1px solid var(--bd-default)",
                        borderRadius: 3,
                        cursor: "pointer",
                      }}
                    >
                      Download sample.jsonl
                    </button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jsonl,.json,.txt,application/jsonl,application/json,text/plain"
                  onChange={onFileInputChange}
                  style={{ display: "none" }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  style={{
                    padding: 32,
                    border: `1px dashed ${dragOver ? "var(--accent)" : "var(--bd-strong)"}`,
                    borderRadius: 4,
                    textAlign: "center",
                    background: dragOver ? "var(--accent-muted)" : "var(--bg-sunken)",
                    cursor: "pointer",
                    transition: "border-color 150ms ease-out, background 150ms ease-out",
                    outline: "none",
                  }}
                >
                  <Icon
                    name="upload"
                    size={24}
                    style={{
                      color: "var(--tx-tertiary)",
                      margin: "0 auto 10px",
                      display: "block",
                    }}
                  />
                  {seedFileName ? (
                    <>
                      <div style={{ fontSize: 13, marginBottom: 4, color: "var(--tx-primary)" }}>
                        {seedFileName}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--tx-tertiary)" }}>
                        Click to replace · or drop another file
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        Click to browse or drop your style-seed file
                      </div>
                      <div style={{ fontSize: 12, color: "var(--tx-tertiary)" }}>
                        .jsonl · .json · .txt · 10+ examples recommended · 5 MB max
                      </div>
                    </>
                  )}
                </div>
                {uploadError && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--danger)" }}>
                    {uploadError}
                  </div>
                )}
                {seedFileName && (
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={clearFile}
                      style={{
                        fontSize: 12,
                        color: "var(--tx-tertiary)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 8px",
                      }}
                    >
                      Clear file
                    </button>
                  </div>
                )}
                <Textarea
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  placeholder="Or paste JSONL here, one {...} per line…"
                  rows={6}
                  style={{ marginTop: 12, fontFamily: "var(--mono)" }}
                />
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 12,
                fontSize: 12,
                color: "var(--tx-secondary)",
              }}
            >
              <span>
                <span className="num">{samples}</span> examples detected
                {seedMode === "simple" && arch && (
                  <span style={{ color: "var(--tx-tertiary)", marginLeft: 8 }}>
                    · will train as {arch}
                  </span>
                )}
              </span>
              <span
                style={{
                  color: samples >= 10 ? "var(--success)" : "var(--warning)",
                }}
              >
                {samples >= 10 ? "Ready" : "Needs 10+"}
              </span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="label" style={{ marginBottom: 10 }}>
              Pick an archetype
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              {ARCHETYPES.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setArch(a.id)}
                  style={{
                    padding: 16,
                    textAlign: "left",
                    background: arch === a.id ? "var(--accent-muted)" : "var(--bg-sunken)",
                    border: `1px solid ${arch === a.id ? "var(--accent-border)" : "var(--bd-default)"}`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{a.name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--tx-secondary)",
                      marginBottom: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    {a.blurb}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--tx-tertiary)",
                      textTransform: "uppercase",
                    }}
                  >
                    {a.stat}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div
            className="al-wizard-2col"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}
          >
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Fighter name
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="E.g. ROAST-9000"
              />
              <div style={{ fontSize: 11, color: "var(--tx-tertiary)", marginTop: 6 }}>
                3–24 chars · stored off-chain via encrypted metadata
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Avatar
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    onClick={() => setAvatar(i)}
                    style={{
                      padding: 6,
                      background: "var(--bg-sunken)",
                      border: `1px solid ${avatar === i ? "var(--accent-border)" : "var(--bd-default)"}`,
                      borderRadius: 4,
                    }}
                  >
                    <Sigil
                      seed={(name || "fighter") + i}
                      size={56}
                      color={
                        ["var(--fighter-a)", "var(--fighter-b)", "var(--accent)"][i]
                      }
                    />
                  </button>
                ))}
              </div>
              <Button size="sm" style={{ marginTop: 10 }}>
                Regenerate
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            {mint.phase === "idle" && (
              <>
                <div className="label" style={{ marginBottom: 12 }}>Review</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div className="label">Name</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{name || "Unnamed"}</div>
                  </div>
                  <div>
                    <div className="label">Archetype</div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {arch}
                    </div>
                  </div>
                  <div>
                    <div className="label">Samples</div>
                    <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
                      {samples}
                    </div>
                  </div>
                  <div>
                    <div className="label">Owner</div>
                    <Hash value={addr ?? ""} />
                  </div>
                </div>
                <div
                  style={{
                    padding: 14,
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--bd-subtle)",
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <div className="label">Flow</div>
                    {mint.mintFee !== undefined && (
                      <div className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
                        {Number(mint.mintFee) / 1e18} 0G mint fee
                      </div>
                    )}
                  </div>
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      fontSize: 12,
                      color: "var(--tx-secondary)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <li>1. Seed uploaded to 0G Storage (encrypted)</li>
                    <li>2. Fine-tune on 0G Compute (~2–5 min)</li>
                    <li>3. Weights encrypted + pinned on 0G Storage</li>
                    <li>4. You sign the mint — fee goes to treasury, INFT to your wallet</li>
                  </ul>
                </div>
              </>
            )}
            {running && (
              <div style={{ padding: 32 }}>
                {PHASE_ORDER.map((p) => {
                  const activeIdx = PHASE_ORDER.indexOf(
                    mint.phase as (typeof PHASE_ORDER)[number],
                  );
                  const myIdx = PHASE_ORDER.indexOf(p);
                  const status =
                    activeIdx === myIdx ? "active" : activeIdx > myIdx ? "done" : "pending";
                  const color =
                    status === "active"
                      ? "var(--accent)"
                      : status === "done"
                        ? "var(--success)"
                        : "var(--tx-disabled)";
                  return (
                    <div
                      key={p}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 14,
                      }}
                    >
                      <Icon
                        name={status === "done" ? "check" : "dot"}
                        size={14}
                        style={{ color }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {PHASE_LABELS[p]}
                        </div>
                        {status === "active" && <Skel w="100%" h={4} style={{ marginTop: 6 }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {mint.phase === "done" && mint.result && (
              <div style={{ padding: 32, textAlign: "center" }}>
                <Icon
                  name="check"
                  size={40}
                  style={{
                    color: "var(--success)",
                    margin: "0 auto 10px",
                    display: "block",
                  }}
                />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  Fighter #{mint.result.tokenId} · TEE verified
                </div>
                <div style={{ fontSize: 13, color: "var(--tx-secondary)" }}>
                  Redirecting to profile…
                </div>
                <div style={{ marginTop: 12 }}>
                  <Hash value={mint.result.txHash} copy />
                </div>
              </div>
            )}
            {mint.phase === "error" && (
              <div
                style={{
                  padding: 18,
                  background: "rgba(232,107,107,0.08)",
                  border: "1px solid rgba(232,107,107,0.30)",
                  borderRadius: 4,
                  fontSize: 13,
                  color: "var(--tx-primary)",
                }}
              >
                {mint.error?.message ?? "Mint failed"}
              </div>
            )}
          </div>
        )}
      </Card>

      {mint.phase !== "done" && !running && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <Button onClick={() => (step > 1 ? setStep(step - 1) : router.push("/"))}>
            {step > 1 ? "Back" : "Cancel"}
          </Button>
          {step < 4 ? (
            <Button
              variant="primary"
              disabled={step === 1 && samples < 10}
              onClick={() => setStep(step + 1)}
              trailing={<Icon name="arrowRight" size={14} />}
            >
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={runMint}>
              {mint.phase === "error" ? "Retry mint" : "Mint fighter"}
            </Button>
          )}
        </div>
      )}
    </PageContainer>
  );
}
