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

/**
 * TEE-attested persona scoring. Five-dimension rubric:
 *
 *   - Logos      — LLM-judged, structural cogency (premise→conclusion)
 *   - Rhetoric   — LLM-judged, vividness + figurative effectiveness
 *   - Aggression — LLM-judged, hedging-ratio + stance strength
 *   - Range      — stylometric MTLD (deterministic)
 *   - Concreteness — stylometric Brysbaert mean (deterministic)
 *
 * The three LLM-judged dimensions run via median-of-five separate calls to
 * suppress per-call noise; the stylometric pair are pure functions of the
 * seed text. The final attestation packs all five scores into a canonical
 * line that the TEE provider re-echoes character-for-character — same
 * canonicalSignAndPack pattern as runner.ts settle-time bundles. The
 * 0G Compute provider's signature over that echo is what BattleEscrow /
 * YapFighter verifies on-chain, so a leak of any server key here cannot
 * forge scores.
 */

export interface ScoreInput {
  /** 0G Compute provider address. Caller usually inherits from the runner
   *  pool; if omitted, the first available chatbot provider is picked. */
  providerAddress?: string;
  /** User-authored persona seed text. */
  seed: string;
  /** Token id this attestation will commit against. Assigned by the mint
   *  flow before scoring fires (typically `nextTokenId()` read). */
  tokenId: number | bigint;
  /** YapFighter contract address — lowercased into the canonical line so
   *  the on-chain verifier can confirm the attestation isn't replayable
   *  against a sibling contract instance. */
  fighterAddr: `0x${string}`;
  /** Chain id for canonical-text replay defense across testnet / mainnet. */
  chainId: number;
}

export interface ScoredAttestation {
  /** Five scores, in canonical order: Logos, Rhetoric, Aggression, Range,
   *  Concreteness. Each is 1–5. */
  scores: [
    logos: 1 | 2 | 3 | 4 | 5,
    rhetoric: 1 | 2 | 3 | 4 | 5,
    aggression: 1 | 2 | 3 | 4 | 5,
    range: 1 | 2 | 3 | 4 | 5,
    concreteness: 1 | 2 | 3 | 4 | 5,
  ];
  /** keccak-style sha256 of the seed text bytes — commits the input
   *  without leaking the plaintext. */
  seedHash: `0x${string}`;
  /** The full canonical line the TEE echoed. Verifiable on-chain. */
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
  /** Per-dimension judge call audit trail — every LLM raw output we
   *  aggregated. Useful for surfacing in the FE so users can see the
   *  rationale behind a 4/5 vs a 3/5. */
  judgeTrail: {
    logos: number[];
    rhetoric: number[];
    aggression: number[];
  };
}

const SYSTEM_JUDGE =
  "You are a deterministic scoring tool for AI debate fighter persona seeds. " +
  "For each dimension you are asked about, output exactly one line in the form " +
  "`<Dimension>|<score>` where <score> is an integer 1–5. No prose, no preamble, " +
  "no postscript, no markdown, no quotes, no extra whitespace.";

const RUBRIC: Record<"logos" | "rhetoric" | "aggression", string> = {
  logos:
    "Score this persona seed on Logos (1–5).\n" +
    "1 = Disconnected statements, no premise→conclusion linkage. Example: \"I just like coffee man. It's good. Drink it.\"\n" +
    "3 = Some structure but logical gaps. Example: \"Coffee is better than tea because more people drink it, also it tastes good.\"\n" +
    "5 = Clear premise-conclusion structure throughout. Example: \"Coffee outranks tea on adoption (90% global share) and cultural durability, both of which compound — therefore coffee.\"\n" +
    "Output exactly: Logos|<score>",
  rhetoric:
    "Score this persona seed on Rhetoric (1–5) — vividness, figurative language effectiveness, audience pull.\n" +
    "1 = Flat, generic, no imagery. Example: \"My fighter is good at debating.\"\n" +
    "3 = Some figurative reach but uneven. Example: \"My fighter argues like a thunderstorm rolling in.\"\n" +
    "5 = Vivid throughout, controlled imagery. Example: \"He doesn't argue — he slices: each clause a thin blade between joints of your premise.\"\n" +
    "Output exactly: Rhetoric|<score>",
  aggression:
    "Score this persona seed on Aggression (1–5) — stance strength + low hedging ratio. Score 5 = bold claims with no qualifiers; 1 = heavy hedging (\"perhaps\", \"some might say\", \"in a sense\").\n" +
    "1 = Heavily hedged. Example: \"My fighter might possibly sometimes try to argue politely if conditions allow.\"\n" +
    "3 = Mixed stance + hedges. Example: \"My fighter usually wins but it depends on the topic.\"\n" +
    "5 = Bold, no hedges. Example: \"My fighter wins. Topic doesn't matter. Pick your ground and lose it.\"\n" +
    "Output exactly: Aggression|<score>",
};

interface JudgeAttempt {
  raw: string;
  score: number | null;
}

function parseScore(raw: string, label: string): number | null {
  // Expect "<Label>|<score>" — accept whitespace; reject if score is out
  // of band. The judge system prompt is strict but real LLMs leak occasional
  // punctuation; tolerate a leading/trailing wrap.
  const m = raw.trim().match(new RegExp(`${label}\\s*\\|\\s*([1-5])\\b`, "i"));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 5 ? n : null;
}

function median5(scores: number[]): 1 | 2 | 3 | 4 | 5 {
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  // Clamp into the rubric band — paranoia, since parseScore already gates.
  const clamped = Math.max(1, Math.min(5, mid));
  return clamped as 1 | 2 | 3 | 4 | 5;
}

async function judgeDimension(
  providerAddress: string | undefined,
  seed: string,
  dimension: "logos" | "rhetoric" | "aggression",
  samples: number,
): Promise<{ score: 1 | 2 | 3 | 4 | 5; raw: number[] }> {
  const label =
    dimension === "logos"
      ? "Logos"
      : dimension === "rhetoric"
        ? "Rhetoric"
        : "Aggression";
  const user = `${RUBRIC[dimension]}\n\nSeed:\n${seed}`;
  const attempts: JudgeAttempt[] = [];
  // Fire judge calls sequentially — the broker rate-limits per provider, and
  // a Promise.all volley triggers "concurrent request" rejects on the 0G
  // Compute side. Five sequential ~1.5s calls is ~7.5s total, acceptable
  // for a one-shot mint-time scoring path.
  for (let i = 0; i < samples; i++) {
    try {
      const r = await runChat({
        providerAddress,
        system: SYSTEM_JUDGE,
        user,
        temperature: 0.1, // small jitter so identical calls don't fully co-vary
        maxTokens: 16,
      });
      attempts.push({ raw: r.content, score: parseScore(r.content, label) });
    } catch (e) {
      attempts.push({
        raw: e instanceof Error ? e.message : String(e),
        score: null,
      });
    }
  }
  const parsed = attempts
    .map((a) => a.score)
    .filter((s): s is number => s !== null);
  // Brief spec: abort if >2 calls fail to parse (i.e. less than 3 valid).
  if (parsed.length < 3) {
    throw new Error(
      `score-persona: ${dimension} judge produced ${parsed.length}/${samples} valid scores; aborting`,
    );
  }
  return { score: median5(parsed), raw: parsed };
}

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

  // LLM-judged scores, median over `samples` independent calls.
  const [logos, rhetoric, aggression] = await Promise.all(
    (["logos", "rhetoric", "aggression"] as const).map((d) =>
      judgeDimension(input.providerAddress, seed, d, samples),
    ),
  );

  const seedHash = sha256(stringToBytes(seed));

  // Canonical attestation line — same shape as runner.ts:canonicalSignAndPack
  // (`<TAG>|chainId|contract|...payload>`). The TAG namespaces the line so a
  // verdict echo can't be replayed against a YapFighter score verifier.
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

  // Echo the canonical line through the TEE provider. `temperature: 0` and
  // the deterministic-transcription system prompt keep the LLM output a
  // byte-perfect copy — required for the on-chain verifier to walk the
  // contentOffset and re-check sha256(responseBody).
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
    judgeTrail: {
      logos: logos.raw,
      rhetoric: rhetoric.raw,
      aggression: aggression.raw,
    },
  };
}
