// Pure aggregation primitives extracted from `score-persona.ts` so the
// regex + median + spread checks can be unit-tested without pulling in
// the server-only broker SDK. The live `scorePersona()` re-exports
// these via its `_internal` namespace so call sites that already
// imported through there don't need to move.

export type LLMDimension = "logos" | "rhetoric" | "aggression";

export const DIMENSION_LABEL: Record<LLMDimension, string> = {
  logos: "LOGOS",
  rhetoric: "RHETORIC",
  aggression: "AGGRESSION",
};

export interface JudgeAttempt {
  raw: string;
  score: number | null;
  evidence: string;
}

export interface DimensionResult {
  score: 1 | 2 | 3 | 4 | 5;
  attempts: JudgeAttempt[];
  lowConfidence: boolean;
  evidence: string;
}

/** Parse `<DIM>|<score>|<evidence>` — tolerant of surrounding
 *  whitespace + casing. Returns `{ score: null, evidence: "" }` on
 *  any miss so the aggregator can treat it as malformed. */
export function parseLine(
  raw: string,
  dimension: LLMDimension,
): { score: number | null; evidence: string } {
  const label = DIMENSION_LABEL[dimension];
  const re = new RegExp(`${label}\\s*\\|\\s*([1-5])\\s*\\|\\s*(.+?)\\s*$`, "i");
  const m = raw.trim().match(re);
  if (!m) return { score: null, evidence: "" };
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 5) return { score: null, evidence: "" };
  return { score: n, evidence: m[2].trim() };
}

/** Integer median of 1-5 scores. Clamps to the rubric band as a
 *  paranoia guard against future callers passing pre-parsed values
 *  that escaped parseLine's bound check. */
export function median(scores: number[]): 1 | 2 | 3 | 4 | 5 {
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const clamped = Math.max(1, Math.min(5, mid));
  return clamped as 1 | 2 | 3 | 4 | 5;
}

/** Median + spread aggregation across N judge calls. Spec from
 *  docs/persona-rubrics.md:
 *    - low_confidence when max-min ≥ 2 across parsed scores
 *    - abort when ≥2 calls per dimension malformed (judge_unstable)
 *    - evidence string = first call at the median (deterministic
 *      tie-break via call order) */
export function aggregate(
  attempts: JudgeAttempt[],
  dimension: LLMDimension,
): DimensionResult {
  const parsed = attempts.filter(
    (a): a is JudgeAttempt & { score: number } => a.score !== null,
  );
  const malformed = attempts.length - parsed.length;
  if (malformed >= 2) {
    throw new Error(
      `score-persona: ${dimension} judge_unstable — ${malformed}/${attempts.length} calls malformed`,
    );
  }
  if (parsed.length === 0) {
    throw new Error(`score-persona: ${dimension} produced no parseable scores`);
  }
  const scores = parsed.map((a) => a.score);
  const med = median(scores);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const evidence = parsed.find((a) => a.score === med)?.evidence ?? "";
  return {
    score: med,
    attempts,
    lowConfidence: max - min >= 2,
    evidence,
  };
}
