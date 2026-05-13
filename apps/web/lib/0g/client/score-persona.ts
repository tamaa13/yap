"use client";

// Browser-side port of `lib/0g/score-persona.ts`. Identical scoring
// methodology (anchored 5-dim rubric, median-of-N with low-confidence
// flag + judge_unstable abort, canonical echo + TEE signature fetch)
// — only difference is the broker is supplied by the caller (built
// from the user's wallet) instead of derived from a server env key.
// Opsi B (2026-05-13).
//
// Aggregation primitives (parseLine / median / aggregate) are re-used
// from `lib/0g/score-persona-aggregate.ts` — pure module with no
// server-only guard. Stylometric helpers (`mtldToRangeScore`,
// `concretenessToScore`) are also pure.

import { sha256 } from "viem";
import { stringToBytes } from "viem/utils";
import type { ZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import {
  fetchProviderSignature,
  findCanonicalContentOffset,
  runCanonicalChat,
  runChat,
} from "./inference";
import { mtldToRangeScore } from "@/lib/stylometry/mtld";
import { concretenessToScore } from "@/lib/stylometry/brysbaert";
import {
  aggregate as aggregateAttempts,
  parseLine,
  type DimensionResult,
  type JudgeAttempt,
  type LLMDimension,
} from "../score-persona-aggregate";
export type {
  DimensionResult,
  JudgeAttempt,
  LLMDimension,
} from "../score-persona-aggregate";

export interface ScoreInput {
  /** 0G Compute provider address. Optional — defaults to the broker's
   *  first matching chatbot service when omitted. */
  providerAddress?: string;
  seed: string;
  tokenId: number | bigint;
  fighterAddr: `0x${string}`;
  chainId: number;
}

export interface ScoredAttestation {
  scores: [
    logos: 1 | 2 | 3 | 4 | 5,
    rhetoric: 1 | 2 | 3 | 4 | 5,
    aggression: 1 | 2 | 3 | 4 | 5,
    range: 1 | 2 | 3 | 4 | 5,
    concreteness: 1 | 2 | 3 | 4 | 5,
  ];
  seedHash: `0x${string}`;
  canonicalText: string;
  responseBody: Uint8Array;
  contentOffset: number;
  signedText: string;
  teeSignature: `0x${string}`;
  providerAddress: string;
  lowConfidence: boolean;
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

async function judgeDimension(
  broker: ZGComputeNetworkBroker,
  providerAddress: string | undefined,
  seed: string,
  dimension: LLMDimension,
  samples: number,
): Promise<DimensionResult> {
  const system = SYSTEM_PROMPTS[dimension];
  const user = `${USER_PROMPT_PREFIX[dimension]}\n\nSEED:\n${seed}\n\nRespond now with the single-line verdict.`;
  const attempts: JudgeAttempt[] = [];
  for (let i = 0; i < samples; i++) {
    try {
      const r = await runChat(broker, {
        providerAddress,
        system,
        user,
        temperature: 0.3,
        // 192 tokens of headroom for the verdict line in case the
        // mainnet provider's safety harness prepends a refusal
        // preamble. See server-side score-persona for the rationale.
        maxTokens: 192,
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

export async function scorePersona(
  broker: ZGComputeNetworkBroker,
  input: ScoreInput,
  opts: { llmSamples?: number } = {},
): Promise<ScoredAttestation> {
  const samples = opts.llmSamples ?? 5;
  const seed = input.seed.trim();
  if (seed.length === 0) {
    throw new Error("score-persona: seed text is empty");
  }

  const rangeScore = mtldToRangeScore(seed);
  const concretenessScore = concretenessToScore(seed);

  const [logos, rhetoric, aggression] = await Promise.all(
    (["logos", "rhetoric", "aggression"] as const).map((d) =>
      judgeDimension(broker, input.providerAddress, seed, d, samples),
    ),
  );

  const seedHash = sha256(stringToBytes(seed));

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

  const echo = await runCanonicalChat(broker, {
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

  const contentOffset = findCanonicalContentOffset(
    echo.responseBody,
    canonicalText,
  );
  const providerSig = await fetchProviderSignature(
    broker,
    echo.providerAddress,
    echo.chatID,
  );

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
