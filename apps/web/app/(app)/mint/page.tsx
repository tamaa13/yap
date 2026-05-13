"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useBalance, useGasPrice } from "wagmi";
import { formatEther } from "viem";
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
import { useNextTokenId } from "@/hooks/use-next-token-id";
import { useWallet } from "@/hooks/use-wallet";
import { activeChain } from "@/lib/chains";
import { FIGHTER_INFT_ADDRESS } from "@/lib/contracts";
import {
  ARCHETYPE_LIST,
  ARCHETYPE_META,
  isAbilityUnlocked,
  recommendArchetype,
  type ScoreDimension,
} from "@/lib/archetype-meta";
import type { MockScores } from "@/lib/stylometry/mock-scores";
import type { FighterArchetype } from "@/lib/types";

const DIMENSION_LABEL: Record<ScoreDimension, string> = {
  logos: "Logos",
  rhetoric: "Rhetoric",
  aggression: "Aggression",
  range: "Range",
  concreteness: "Concrete",
};

const DIMENSION_HINT: Record<ScoreDimension, string> = {
  logos: "Premise → conclusion structure",
  rhetoric: "Vivid imagery, figurative pull",
  aggression: "Stance strength, low hedging",
  range: "Lexical diversity (MTLD)",
  concreteness: "Sensory, perceivable language",
};

const PHASE_LABELS: Record<string, string> = {
  seed: "Pinning seed to 0G Storage",
  encrypting: "Sealing your fighter",
  signing: "Sign in your wallet",
  minting: "Landing on-chain",
  committing: "Tagging metadata",
};
const PHASE_ORDER = [
  "seed",
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
  // Predicted tokenId for the next mint. Required by /api/mint/score
  // because the canonical text the TEE echoes binds the score to the
  // specific (chainId, fighterAddr, tokenId, seedHash, scores) tuple
  // that `YapFighter.recordMintScores` re-verifies on-chain. Without
  // a tokenId, the route 400s ("tokenId is required for live scoring").
  // The hook scans Minted events + 1; race-prone for concurrent mints,
  // but on a fresh mainnet with single-user demo traffic the prediction
  // is reliable. `refetch` is called right before the mint tx fires
  // to catch any drift since the score request landed.
  const nextTokenId = useNextTokenId();

  // Balance gate (v4 cascade — YapFighter.mint() now charges a fee).
  // We block the final "Sign the mint" button when the wallet can't
  // cover `mintFee + gas`. The mintFee comes from the contract; gas
  // is estimated as `gasPrice × 300_000n` — a conservative gas-limit
  // heuristic because the real mint calldata isn't known until the
  // `/api/mint/start` job runs (which would itself cost the user
  // attention + a server round-trip). 300k covers an ERC-7857 mint
  // with INFT metadata + sealed-key write with headroom; both viem
  // and wagmi re-poll gasPrice on block events so the gate stays
  // live across price moves.
  const { data: balance } = useBalance({
    address: addr,
    query: { enabled: !!addr, refetchInterval: 12_000 },
  });
  const { data: gasPrice } = useGasPrice({
    query: { enabled: !!addr, refetchInterval: 12_000 },
  });
  const mintFee = (mint.mintFee as bigint | undefined) ?? 0n;
  const gasEstimate =
    gasPrice !== undefined ? gasPrice * 300_000n : 0n;
  const requiredOg = mintFee + gasEstimate;
  const insufficientBalance = useMemo(() => {
    if (!balance || mintFee === 0n) return false;
    return balance.value < requiredOg;
  }, [balance, mintFee, requiredOg]);
  const insufficientTooltip = useMemo(() => {
    if (gasEstimate === 0n) return undefined;
    return `Need ${formatEther(mintFee)} OG mint fee + ~${formatEther(gasEstimate)} OG gas. Wallet has ${balance ? formatEther(balance.value) : "?"} OG.`;
  }, [mintFee, gasEstimate, balance]);

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
  // Scoring step state. `scoring` is the spinner gate while the TEE
  // round-trip is in flight. Pre-Phase-4 this is a 1.2s setTimeout
  // around `deriveMockScores`; Phase 4 swaps in a fetch to a real
  // server route that calls `lib/0g/score-persona.ts`. `scoreError` is
  // the surface for retryable failures (parser miss, provider flake).
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<MockScores | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

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
      push({
        kind: "success",
        text: `Fighter #${result.tokenId} lives on-chain. Time to test it.`,
      });
      setTimeout(() => router.push(`/fighters/${result.tokenId}`), 1000);
    } catch (e) {
      push({
        kind: "error",
        text: e instanceof Error ? e.message : "Mint failed",
      });
    }
  };

  const stepLabels = [
    "Style seed",
    "Score traits",
    "Archetype",
    "Name & avatar",
    "Review & mint",
  ];

  // Scoring trigger — fires when leaving step 1 → step 2. POSTs the
  // effective seed to /api/mint/score; the live TEE path needs
  // tokenId + fighterAddr + chainId so the canonical text matches
  // what recordMintScores will re-verify on-chain. Mock-mode tolerates
  // the missing tokenId (route 200s with stub fields), but live mode
  // 400s without it — and the mock-mode FE is no longer the prod path.
  const runScoring = async () => {
    setScoreError(null);
    setScoring(true);
    try {
      // Refetch right before scoring so the prediction is as fresh as
      // possible. Concurrent mints between this read and the eventual
      // mint tx still risk drift (Tama's race-mitigation note); user
      // can re-score from the receipt screen if `recordMintScores`
      // reverts on tokenId mismatch.
      nextTokenId.refetch();
      const tokenIdGuess = nextTokenId.data ?? 1;
      const res = await fetch("/api/mint/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seed: effectiveSeed,
          tokenId: tokenIdGuess,
          fighterAddr: FIGHTER_INFT_ADDRESS,
          chainId: activeChain.id,
        }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(detail.error ?? `Score endpoint returned ${res.status}`);
      }
      const data = (await res.json()) as {
        scores: MockScores;
        mode?: string;
      };
      setScores(data.scores);
      setArch(recommendArchetype(data.scores as unknown as Record<ScoreDimension, number>));
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setScoring(false);
    }
  };

  return (
    <PageContainer maxWidth={920}>
      <Breadcrumbs items={[{ label: "Mint fighter" }]} />
      <h1
        style={{
          fontFamily: "var(--yap-font-display)",
          fontWeight: 400,
          fontSize: 56,
          lineHeight: 0.9,
          letterSpacing: "-0.5px",
          textTransform: "uppercase",
          marginBottom: 8,
          color: "var(--yap-ink-50)",
        }}
      >
        Mint a fighter
      </h1>
      <div
        style={{
          fontSize: 14,
          color: "var(--yap-ink-200)",
          marginBottom: 24,
          maxWidth: "60ch",
        }}
      >
        Seal a persona into an ERC-7857 INFT on 0G. Takes about five
        seconds.
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

      {/* Mint fee callout. Visible across all 5 steps so the user sees
        * the cost commitment from the moment they land on /mint, not
        * just at the final review step. Tints amber/red when the
        * wallet balance can't cover fee + estimated gas. */}
      {mint.mintFee !== undefined && (
        <div
          style={{
            padding: "10px 14px",
            background: insufficientBalance
              ? "rgba(232,107,107,0.08)"
              : "var(--bg-sunken)",
            border: `1px solid ${insufficientBalance ? "rgba(232,107,107,0.30)" : "var(--accent-border)"}`,
            borderRadius: 4,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 12,
          }}
        >
          <div className="mono" style={{ color: insufficientBalance ? "var(--danger)" : "var(--accent)", letterSpacing: 1.2, textTransform: "uppercase" }}>
            Mint fee · <span className="num">{formatEther(mintFee)}</span> OG
          </div>
          {balance && gasPrice !== undefined && (
            <div style={{ color: "var(--tx-secondary)" }}>
              Wallet <span className="num">{Number(formatEther(balance.value)).toFixed(4)}</span> OG
              <span style={{ color: "var(--tx-tertiary)" }}>
                {" "}· est. gas ~<span className="num">{Number(formatEther(gasEstimate)).toFixed(4)}</span> OG
              </span>
            </div>
          )}
        </div>
      )}

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
              TEE persona scoring
            </div>
            {scoring && (
              <div
                style={{
                  padding: 28,
                  textAlign: "center",
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--bd-subtle)",
                  borderRadius: 4,
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--tx-tertiary)",
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  Scoring persona via TEE…
                </div>
                <Skel h={10} w="60%" style={{ margin: "0 auto 8px" }} />
                <Skel h={10} w="40%" style={{ margin: "0 auto" }} />
              </div>
            )}
            {!scoring && scoreError && (
              <div
                style={{
                  padding: 14,
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--danger)",
                  fontSize: 13,
                  color: "var(--danger)",
                }}
              >
                {scoreError}
                <div style={{ marginTop: 8 }}>
                  <Button size="sm" onClick={runScoring}>
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {!scoring && !scoreError && scores && (
              <div
                style={{
                  padding: 16,
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
                    marginBottom: 14,
                  }}
                >
                  <div className="label">5-trait persona score</div>
                  <Button size="sm" onClick={runScoring}>
                    Re-score
                  </Button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(
                    [
                      "logos",
                      "rhetoric",
                      "aggression",
                      "range",
                      "concreteness",
                    ] as const
                  ).map((dim) => {
                    const score = scores[dim];
                    return (
                      <div key={dim}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              fontSize: 11,
                              textTransform: "uppercase",
                              letterSpacing: 1.2,
                              color: "var(--tx-secondary)",
                            }}
                          >
                            {DIMENSION_LABEL[dim]}
                          </span>
                          <span
                            className="num"
                            style={{ fontSize: 13, fontWeight: 600 }}
                          >
                            {score}
                            <span style={{ color: "var(--tx-tertiary)" }}>/5</span>
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: "var(--bd-subtle)",
                            borderRadius: 2,
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${(score / 5) * 100}%`,
                              background:
                                score >= 4
                                  ? "var(--success)"
                                  : score >= 3
                                    ? "var(--accent)"
                                    : "var(--tx-tertiary)",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--tx-tertiary)",
                            marginTop: 2,
                          }}
                        >
                          {DIMENSION_HINT[dim]}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    padding: 10,
                    background: "var(--bg-canvas)",
                    border: "1px solid var(--bd-subtle)",
                    fontSize: 12,
                    color: "var(--tx-secondary)",
                    lineHeight: 1.55,
                  }}
                >
                  Stylometric pair (Range / Concrete) is deterministic from
                  your seed. The other three score the TEE judge's read of
                  structure, vividness, and stance strength — committed
                  on-chain as immutable traits next step.
                </div>
              </div>
            )}
            {!scoring && !scoreError && !scores && (
              <div
                style={{
                  padding: 14,
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--bd-subtle)",
                  fontSize: 13,
                }}
              >
                Click <strong>Score persona</strong> to send your seed to
                the TEE judge.
                <div style={{ marginTop: 10 }}>
                  <Button size="sm" variant="primary" onClick={runScoring}>
                    Score persona
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="label" style={{ marginBottom: 10 }}>
              Pick an archetype
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tx-secondary)",
                marginBottom: 14,
                lineHeight: 1.55,
              }}
            >
              Archetype is committed on-chain — fighter is forever this
              archetype. Each one has a unique ability gated on a trait
              threshold. Picking a mismatch is allowed; the ability stays
              locked until the gate is met by a future re-score.
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              {ARCHETYPE_LIST.map((id) => {
                const meta = ARCHETYPE_META[id];
                const unlocked = scores
                  ? isAbilityUnlocked(id, scores as unknown as Record<ScoreDimension, number>)
                  : false;
                const recommended =
                  scores && recommendArchetype(scores as unknown as Record<ScoreDimension, number>) === id;
                const userScore =
                  scores?.[meta.abilityGate.dimension] ?? 0;
                return (
                  <button
                    key={id}
                    onClick={() => setArch(id)}
                    style={{
                      padding: 16,
                      textAlign: "left",
                      background:
                        arch === id ? "var(--accent-muted)" : "var(--bg-sunken)",
                      border: `1px solid ${
                        arch === id
                          ? "var(--accent-border)"
                          : "var(--bd-default)"
                      }`,
                      borderRadius: 4,
                      position: "relative",
                    }}
                  >
                    {recommended && (
                      <span
                        className="mono"
                        style={{
                          position: "absolute",
                          top: -8,
                          right: 10,
                          padding: "2px 6px",
                          fontSize: 9,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          background: "var(--accent)",
                          color: "var(--yap-ink-900)",
                        }}
                      >
                        Recommended
                      </span>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {meta.name}
                      </div>
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          background: unlocked
                            ? "color-mix(in srgb, var(--success) 15%, transparent)"
                            : "color-mix(in srgb, var(--tx-tertiary) 15%, transparent)",
                          color: unlocked
                            ? "var(--success)"
                            : "var(--tx-tertiary)",
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          borderRadius: 2,
                          whiteSpace: "nowrap",
                          marginLeft: 6,
                          flexShrink: 0,
                        }}
                      >
                        {unlocked ? "✓ unlocked" : "✗ locked"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--tx-secondary)",
                        marginBottom: 10,
                        lineHeight: 1.5,
                      }}
                    >
                      {meta.blurb}
                    </div>
                    <div
                      style={{
                        padding: 8,
                        background: "var(--bg-canvas)",
                        border: "1px solid var(--bd-subtle)",
                        borderRadius: 3,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        className="mono"
                        style={{
                          fontSize: 10,
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          color: unlocked
                            ? "var(--accent)"
                            : "var(--tx-tertiary)",
                          marginBottom: 2,
                        }}
                      >
                        Ability · {meta.abilityName}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--tx-secondary)",
                          lineHeight: 1.45,
                        }}
                      >
                        {meta.abilityBlurb}
                      </div>
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: unlocked ? "var(--tx-tertiary)" : "var(--danger)",
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                      }}
                    >
                      Gate · {DIMENSION_LABEL[meta.abilityGate.dimension]}{" "}
                      {userScore}/{meta.abilityGate.minScore}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
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

        {step === 5 && (
          <div>
            {mint.phase === "idle" && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 16,
                    gap: 12,
                  }}
                >
                  <div className="label" style={{ color: "var(--yap-crimson)" }}>
                    ━━ Persona Preview
                  </div>
                  <span className="token-badge token-badge--gold">
                    #?? · pending mint
                  </span>
                </div>
                <div style={{ display: "flex", gap: 18, marginBottom: 18 }}>
                  <Sigil
                    seed={name || arch}
                    size={92}
                    color="var(--yap-crimson)"
                    radius={0}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "var(--yap-font-display)",
                        fontWeight: 400,
                        fontSize: 36,
                        lineHeight: 0.95,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 6,
                        color: "var(--yap-ink-50)",
                      }}
                    >
                      {name || "Unnamed"}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: "var(--yap-ink-300)",
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        marginBottom: 12,
                      }}
                    >
                      {arch} · {samples} sample{samples === 1 ? "" : "s"}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: "var(--yap-ink-400)",
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                        }}
                      >
                        Owner
                      </span>
                      <Hash value={addr ?? ""} />
                    </div>
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
                    <li>1. Seed uploaded to 0G Storage (auditable fingerprint)</li>
                    <li>2. Persona sealed with a fresh AES key</li>
                    <li>3. Encrypted INFT payload pinned on 0G Storage</li>
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
                  return (
                    <MintPhaseRow
                      key={p}
                      label={PHASE_LABELS[p]}
                      status={status}
                    />
                  );
                })}
              </div>
            )}
            {mint.phase === "done" && mint.result && (
              <MintCompleteReveal
                tokenId={mint.result.tokenId}
                txHash={mint.result.txHash}
              />
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
          {step < 5 ? (
            <Button
              variant="primary"
              disabled={
                (step === 1 && samples < 10) ||
                (step === 2 && (!scores || scoring))
              }
              onClick={() => {
                // Leaving step 1 → fire scoring if we haven't yet (or
                // the seed text changed since last score). Cheap to
                // re-fire — derived locally pre-Phase-4.
                if (step === 1 && !scores) {
                  void runScoring();
                }
                setStep(step + 1);
              }}
              trailing={<Icon name="arrowRight" size={14} />}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={runMint}
              disabled={insufficientBalance}
              title={insufficientBalance ? insufficientTooltip : undefined}
            >
              {insufficientBalance
                ? "Insufficient balance"
                : mint.phase === "error"
                ? "Try again"
                : "Sign the mint"}
            </Button>
          )}
        </div>
      )}
    </PageContainer>
  );
}

/**
 * Phase indicator row — when a phase becomes active, the icon does a
 * brief overshoot punch (combat vocab — the work is *advancing*).
 * "done" rows tint to success and stay still. "pending" rows are quiet.
 */
function MintPhaseRow({
  label,
  status,
}: {
  label: string;
  status: "active" | "done" | "pending";
}) {
  const reduced = useReducedMotion();
  const color =
    status === "active"
      ? "var(--accent)"
      : status === "done"
        ? "var(--success)"
        : "var(--tx-disabled)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <motion.span
        // Re-mount the icon when status flips so the overshoot fires
        // exactly once per transition.
        key={status}
        initial={
          reduced || status === "pending"
            ? false
            : { scale: 0.7, opacity: 0.6 }
        }
        animate={
          reduced
            ? { scale: 1, opacity: 1 }
            : status === "active"
              ? { scale: [0.8, 1.18, 1], opacity: 1 }
              : status === "done"
                ? { scale: [0.85, 1.08, 1], opacity: 1 }
                : { scale: 1, opacity: 1 }
        }
        transition={{
          duration: status === "active" ? 0.4 : 0.32,
          ease: [0.34, 1.56, 0.64, 1],
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={status === "done" ? "check" : "dot"}
          size={14}
          style={{ color }}
        />
      </motion.span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {status === "active" && <Skel w="100%" h={4} style={{ marginTop: 6 }} />}
      </div>
    </div>
  );
}

/**
 * Mint complete reveal — combat vocab. The fighter just *became real*.
 * Icon scales in with overshoot, label and Hash stagger after with quiet
 * fades so the moment lands as one beat, not three.
 */
function MintCompleteReveal({
  tokenId,
  txHash,
}: {
  tokenId: number;
  txHash: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <motion.div
        initial={reduced ? false : { scale: 0.85, opacity: 0 }}
        animate={
          reduced
            ? { scale: 1, opacity: 1 }
            : { scale: [0.85, 1.08, 1], opacity: 1 }
        }
        transition={{
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1],
        }}
        style={{ display: "inline-block", marginBottom: 10 }}
      >
        <Icon
          name="check"
          size={40}
          style={{ color: "var(--success)", display: "block" }}
        />
      </motion.div>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.18, ease: [0.32, 0.72, 0, 1] }}
        style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}
      >
        Fighter #{tokenId}. Locked on-chain.
      </motion.div>
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32, delay: 0.32, ease: "easeOut" }}
        style={{ fontSize: 13, color: "var(--tx-secondary)" }}
      >
        Pulling up the profile…
      </motion.div>
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32, delay: 0.4, ease: "easeOut" }}
        style={{ marginTop: 12 }}
      >
        <Hash value={txHash} copy />
      </motion.div>
    </div>
  );
}
