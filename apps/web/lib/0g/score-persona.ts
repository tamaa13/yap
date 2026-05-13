import "server-only";
import { sha256 } from "viem";
import { stringToBytes } from "viem/utils";
import {
  findCanonicalContentOffset,
  fetchProviderSignature,
  runCanonicalChat,
  runChat,
} from "@/lib/0g/inference";
import { mtldToRangeScore } from "@/lib/stylometry/mtld";
import { concretenessToScore } from "@/lib/stylometry/brysbaert";
import {
  aggregate as aggregateAttempts,
  parseLine,
  type DimensionResult,
  type JudgeAttempt,
  type LLMDimension,
} from "./score-persona-aggregate";
export type {
  DimensionResult,
  JudgeAttempt,
  LLMDimension,
} from "./score-persona-aggregate";

/**
 * TEE-attested persona scoring (Phase 4 live path).
 *
 * Five-dimension rubric:
 *   - Logos      — LLM-judged, structural cogency
 *   - Rhetoric   — LLM-judged, vividness + figurative effectiveness
 *   - Aggression — LLM-judged, stance strength (low hedging)
 *   - Range      — stylometric MTLD (deterministic)
 *   - Concreteness — Brysbaert mean (deterministic)
 *
 * The three LLM-judged dimensions each run 5 independent calls at
 * temp=0.3 with the canonical anchored rubric from
 * docs/persona-rubrics.md. The judge model is asked for a strict
 * `<DIMENSION>|<score>|<evidence>` line — anti-bias instructions in
 * the system prompt fight the model's verbosity / authority /
 * RLHF-balance biases.
 *
 * Aggregation:
 *   - Primary score = median of the 5 parsed integers (resists single-
 *     call outliers, stays in the 1–5 ordinal anchors).
 *   - Confidence flag = max-min across calls. ≥ 2 → low_confidence,
 *     surfaced on the attestation envelope so the mint UI can let the
 *     user re-roll once before final commit.
 *   - Evidence = the evidence sentence from the median-scoring call
 *     (ties broken by call order, lowest index first).
 *   - All 5 raw scores + evidences are retained on the attestation so
 *     anyone can re-verify the aggregation off-chain.
 *
 * Failure mode:
 *   - Per-call malformed output (regex miss) → that call is discarded.
 *     If ≥2 calls per dimension malform, the whole call aborts with
 *     `judge_unstable_<dim>` — silently scoring on a 3-sample median
 *     would compromise the attestation.
 *
 * The final canonical text echoes through the TEE provider the same
 * way `runner.ts:canonicalSignAndPack` does for verdicts. BattleEscrow
 * / YapFighter verify the contentOffset + sha256(responseBody) +
 * provider signature on-chain. A leak of any server key here cannot
 * forge scores; the TEE-derived signature is required.
 */

export interface ScoreInput {
  /** 0G Compute provider address. Caller usually inherits from the
   *  runner pool; if omitted, the first available chatbot provider is
   *  picked by the broker. */
  providerAddress?: string;
  /** User-authored persona seed text. */
  seed: string;
  /** Token id this attestation will commit against. Assigned by the
   *  mint flow before scoring fires (typically a `nextTokenId()` read). */
  tokenId: number | bigint;
  /** YapFighter contract address — lowercased into the canonical line
   *  so the on-chain verifier can confirm the attestation isn't
   *  replayable against a sibling contract instance. */
  fighterAddr: `0x${string}`;
  /** Chain id for canonical-text replay defense across testnet / mainnet. */
  chainId: number;
}


export interface ScoredAttestation {
  /** Five scores, in canonical order: Logos, Rhetoric, Aggression,
   *  Range, Concreteness. Each is 1–5. Matches the on-chain
   *  YapFighter packed-bytes5 layout via TRAIT_INDEX in archetype-meta. */
  scores: [
    logos: 1 | 2 | 3 | 4 | 5,
    rhetoric: 1 | 2 | 3 | 4 | 5,
    aggression: 1 | 2 | 3 | 4 | 5,
    range: 1 | 2 | 3 | 4 | 5,
    concreteness: 1 | 2 | 3 | 4 | 5,
  ];
  /** sha256 of the seed text bytes — commits the input without leaking
   *  plaintext. */
  seedHash: `0x${string}`;
  /** Full canonical line the TEE echoed. Verifiable on-chain. */
  canonicalText: string;
  /** Raw response body bytes from the canonical echo call. */
  responseBody: Uint8Array;
  /** Byte offset inside `responseBody` where the canonical text starts. */
  contentOffset: number;
  /** Provider-signed text envelope (canonical text, framed by provider). */
  signedText: string;
  /** TEE signature over `signedText`. */
  teeSignature: `0x${string}`;
  /** Provider that issued the echo + signature. */
  providerAddress: string;
  /** True iff ANY of the three LLM dimensions tripped its
   *  low-confidence flag. The mint UI should surface this on the
   *  receipt so the user can re-roll once before final commit. */
  lowConfidence: boolean;
  /** Per-dimension audit trail with all 5 raw scores + evidence. */
  judge: {
    logos: DimensionResult;
    rhetoric: DimensionResult;
    aggression: DimensionResult;
  };
}

// ─── Anchored rubrics (canonical source: docs/persona-rubrics.md) ────────

const SYSTEM_PROMPTS: Record<LLMDimension, string> = {
  logos:
    "You are a strict argumentation analyst scoring debate-fighter persona seeds on LOGOS (argument structure/cogency). You ignore length, citations, and stylistic polish. You score only the inferential scaffolding present in the seed. Output exactly one line: \"LOGOS|<1-5>|<one-sentence-evidence>\". No other text.",
  rhetoric:
    "You are a literary critic scoring debate-fighter persona seeds on RHETORIC (effectiveness/vividness of expression). You ignore factual accuracy, argument validity, and length. You score only voice, imagery, framing, and cadence. Output exactly one line: \"RHETORIC|<1-5>|<one-sentence-evidence>\". No other text.",
  aggression:
    "You are a stance analyst scoring debate-fighter persona seeds on AGGRESSION (stance strength and low hedging). You score commitment to claims, NOT rudeness or cruelty. A calm seed with a hard stance scores HIGH; a loud seed full of hedges scores LOW. You explicitly penalize RLHF-style both-sidesing. Output exactly one line: \"AGGRESSION|<1-5>|<one-sentence-evidence>\". No other text.",
};

const USER_PROMPT_PREFIX: Record<LLMDimension, string> = {
  logos:
    "Score the following persona seed for LOGOS using the 1-5 anchored rubric. Resist verbosity bias, authority bias, and preference for fluent LLM-style prose without claim commitment.\n\nAnchors:\n1 = pure assertion, no scaffolding.\n2 = single-step claims, weak support.\n3 = coherent but shallow (one premise→conclusion, no objection handling).\n4 = multi-step chain with anticipated rebuttals.\n5 = disciplined argumentation, explicit premises, edge cases handled.",
  rhetoric:
    "Score the following persona seed for RHETORIC using the 1-5 anchored rubric. Resist verbosity bias, authority bias, and preference for register-flat LLM polish.\n\nAnchors:\n1 = flat, no imagery.\n2 = occasional adjective, otherwise plain.\n3 = workable imagery, intermittent punch.\n4 = consistent voice, compounding imagery.\n5 = sustained rhetorical signature — every line earns its place.",
  aggression:
    "Score the following persona seed for AGGRESSION using the 1-5 anchored rubric. Resist verbosity bias, authority bias, and the trained preference for balanced/hedged framing.\n\nAnchors:\n1 = maximum hedging, symmetric both-sidesing.\n2 = soft lean, heavy qualifiers.\n3 = clear position, polite framing.\n4 = committed, unhedged, willing to offend.\n5 = maximum stance, refuses any escape hatch.",
};

// ─── One dimension, 5 calls ─────────────────────────────────────────────

async function judgeDimension(
  providerAddress: string | undefined,
  seed: string,
  dimension: LLMDimension,
  samples: number,
): Promise<DimensionResult> {
  const system = SYSTEM_PROMPTS[dimension];
  const user = `${USER_PROMPT_PREFIX[dimension]}\n\nSEED:\n${seed}\n\nRespond now with the single-line verdict.`;
  const attempts: JudgeAttempt[] = [];
  // Sequential within dimension — broker rate-limits per-provider, and
  // a Promise.all of 5 fires "concurrent request" rejects on the 0G
  // Compute SDK. The three *dimensions* still run in parallel from
  // the caller (Promise.all over the 3 outer judgeDimension calls) so
  // total wall-clock stays at ~5 × per-call latency, not 15×.
  for (let i = 0; i < samples; i++) {
    try {
      const r = await runChat({
        providerAddress,
        system,
        user,
        temperature: 0.3,
        maxTokens: 96, // headroom for the evidence sentence
      });
      const { score, evidence } = parseLine(r.content, dimension);
      attempts.push({ raw: r.content, score, evidence });
    } catch (e) {
      attempts.push({
        raw: e instanceof Error ? e.message : String(e),
        score: null,
        evidence: "",
      });
    }
  }
  return aggregateAttempts(attempts, dimension);
}

// ─── Public entry ───────────────────────────────────────────────────────

export async function scorePersona(
  input: ScoreInput,
  opts: { llmSamples?: number } = {},
): Promise<ScoredAttestation> {
  const samples = opts.llmSamples ?? 5;
  const seed = input.seed.trim();
  if (seed.length === 0) {
    throw new Error("score-persona: seed text is empty");
  }

  // Deterministic stylometric scores — no LLM round-trip needed.
  const rangeScore = mtldToRangeScore(seed);
  const concretenessScore = concretenessToScore(seed);

  // LLM-judged scores. Parallel across dimensions; sequential within.
  const [logos, rhetoric, aggression] = await Promise.all(
    (["logos", "rhetoric", "aggression"] as const).map((d) =>
      judgeDimension(input.providerAddress, seed, d, samples),
    ),
  );

  const seedHash = sha256(stringToBytes(seed));

  // Canonical attestation line — mirrors runner.ts:canonicalSignAndPack
  // (`<TAG>|chainId|contract|...payload>`). The TAG namespaces the
  // line so a verdict echo can't be replayed against a YapFighter
  // score verifier.
  const canonicalText = [
    "YAP_FIGHTER_SCORE",
    input.chainId,
    input.fighterAddr.toLowerCase(),
    typeof input.tokenId === "bigint" ? input.tokenId.toString() : input.tokenId,
    seedHash,
    logos.score,
    rhetoric.score,
    aggression.score,
    rangeScore,
    concretenessScore,
  ].join("|");

  const echo = await runCanonicalChat({
    providerAddress: input.providerAddress,
    system:
      "You are a deterministic transcription tool. Echo the user's text exactly, character-for-character. Output a single line. No prose, no preamble, no postscript, no markdown, no quotes, no extra whitespace.",
    user: canonicalText,
    temperature: 0,
    maxTokens: 256,
  });
  if (!echo.signatureValid) {
    throw new Error(
      "score-persona: TEE signature verification failed for canonical echo",
    );
  }
  if (echo.content.trim() !== canonicalText) {
    throw new Error(
      `score-persona: canonical echo mismatch; got ${JSON.stringify(
        echo.content.slice(0, 200),
      )}`,
    );
  }

  const contentOffset = findCanonicalContentOffset(echo.responseBody, canonicalText);
  const providerSig = await fetchProviderSignature(echo.providerAddress, echo.chatID);

  return {
    scores: [
      logos.score,
      rhetoric.score,
      aggression.score,
      rangeScore,
      concretenessScore,
    ],
    seedHash,
    canonicalText,
    responseBody: echo.responseBody,
    contentOffset,
    signedText: providerSig.text,
    teeSignature: providerSig.signature,
    providerAddress: echo.providerAddress,
    lowConfidence:
      logos.lowConfidence || rhetoric.lowConfidence || aggression.lowConfidence,
    judge: { logos, rhetoric, aggression },
  };
}

// Re-export pure aggregation primitives for callers that previously
// imported through the `_internal` namespace before the move into
// score-persona-aggregate. Tests should import from
// `./score-persona-aggregate` directly to avoid the server-only barrel.
export { aggregateAttempts as aggregate, parseLine };
