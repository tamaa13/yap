/**
 * Concreteness scoring via the Brysbaert et al. (2014) norms.
 *
 *   Brysbaert, M., Warriner, A. B., & Kuperman, V. (2014). Concreteness
 *   ratings for 40 thousand generally known English word lemmas.
 *   Behavior Research Methods, 46(3), 904–911.
 *
 * Each word has a mean rating on a 1–5 scale where 5 = highly concrete
 * (perceivable by the senses) and 1 = highly abstract (only graspable
 * cognitively, e.g., "justice"). The full 40k word list is the canonical
 * source; this module ships a curated subset (see brysbaert-words.json)
 * weighted toward the high-frequency content vocabulary persona seeds
 * actually use. A build script can later swap in the full table verbatim
 * — `lookup()` is total over Record<string, number>.
 *
 * Words not in the table contribute nothing — they're skipped rather than
 * defaulted, since the safe interpretation of "missing" is "the rubric
 * has no signal on this token". The aggregator works on the average of
 * matched words; a seed with zero matches falls through to the neutral
 * score 3 (paralleling MTLD's short-text guard).
 */

import raw from "./brysbaert-words.json";

interface RawTable {
  _note?: string;
  [word: string]: number | string | undefined;
}

const TABLE: Record<string, number> = (() => {
  const t = raw as RawTable;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(t)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "number") out[k] = v;
  }
  return out;
})();

/** Tokenize for concreteness scoring. Same shape as MTLD's tokenizer but
 *  re-implemented here so the two modules don't couple. Strips
 *  punctuation, lowercases, skips length-1 noise. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => t.length > 1);
}

/** Average concreteness across matched tokens. Returns null when zero
 *  tokens match the table — caller decides the fallback (typically the
 *  neutral score 3 to avoid biasing on a vocabulary gap). */
export function averageConcreteness(text: string): number | null {
  const tokens = tokenize(text);
  let sum = 0;
  let n = 0;
  for (const tok of tokens) {
    const rating = TABLE[tok];
    if (rating !== undefined) {
      sum += rating;
      n += 1;
    }
  }
  if (n === 0) return null;
  return sum / n;
}

/**
 * Map a mean Brysbaert concreteness to the 1–5 Concreteness dimension.
 * The published 40k norms have mean ≈ 3.0 (SD ≈ 0.97), so the bands here
 * are spaced ±0.5 SD around the corpus mean — extreme bands lock in
 * genuinely sensory-heavy ("the sword glints, salt on the wind") vs.
 * principle-heavy ("the truth of reason in the form of justice") prose.
 *
 *   < 2.5  → 1   abstract throughout
 *   < 3.0  → 2
 *   < 3.5  → 3   mixed, around corpus mean
 *   < 4.0  → 4
 *   ≥ 4.0  → 5   concrete throughout
 */
export function concretenessToScore(text: string): 1 | 2 | 3 | 4 | 5 {
  const avg = averageConcreteness(text);
  if (avg === null) return 3;
  if (avg < 2.5) return 1;
  if (avg < 3.0) return 2;
  if (avg < 3.5) return 3;
  if (avg < 4.0) return 4;
  return 5;
}

/** Coverage check — `(matched / total tokens)`. Below ~10% the score
 *  reflects the table's blind spots more than the seed; callers can route
 *  to a fallback or flag uncertainty. */
export function tableCoverage(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;
  let matched = 0;
  for (const tok of tokens) if (TABLE[tok] !== undefined) matched += 1;
  return matched / tokens.length;
}
