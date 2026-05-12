/**
 * Moving-Average Type-Token Ratio (MTLD) — McCarthy & Jarvis (2010).
 *
 * MTLD measures lexical diversity by walking through tokens left-to-right
 * (and again right-to-left) and counting how many segments of running
 * TTR ≥ 0.72 fit. Higher scores → more diverse vocabulary; 30s typical of
 * repetitive copy, 100+ for content with rich variation.
 *
 * Resistant to text length above ~50 tokens; below that the score becomes
 * noisy (a single repeat dominates). We expose a `minTokens` guard so the
 * persona-scoring path can route short seeds through a deterministic
 * fallback rather than report a wobbly diversity number.
 *
 * Reference: McCarthy, P. M., & Jarvis, S. (2010). MTLD, vocd-D, and HD-D:
 * A validation study of sophisticated approaches to lexical diversity
 * assessment. Behavior Research Methods, 42(2), 381–392.
 */

const TTR_FLOOR = 0.72;

/** Tokenize on whitespace, lowercase, strip leading/trailing non-word chars.
 *  Empty / single-character tokens are dropped (don't carry diversity
 *  signal — they're punctuation noise from the strip). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => t.length > 1);
}

/** Single-direction MTLD calculator. Walks tokens; whenever TTR drops to
 *  the floor it completes a factor (1.0) and resets. The trailing partial
 *  segment contributes `(1 − TTR) / (1 − floor)` as a fractional factor. */
function mtldOneWay(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  let factors = 0;
  let types = new Set<string>();
  let tokensInSegment = 0;
  for (const tok of tokens) {
    tokensInSegment += 1;
    types.add(tok);
    const ttr = types.size / tokensInSegment;
    if (ttr <= TTR_FLOOR) {
      factors += 1;
      types = new Set<string>();
      tokensInSegment = 0;
    }
  }
  // Trailing partial factor: distance from full diversity (1.0) toward the
  // floor, normalized to the 0–1 range of a full factor.
  if (tokensInSegment > 0) {
    const ttr = types.size / tokensInSegment;
    const partial = (1 - ttr) / (1 - TTR_FLOOR);
    factors += partial;
  }
  if (factors === 0) return tokens.length; // ultra-diverse short text
  return tokens.length / factors;
}

/** Compute MTLD as the mean of forward + reverse passes. */
export function computeMTLD(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length < 2) return 0;
  const forward = mtldOneWay(tokens);
  const reverse = mtldOneWay([...tokens].reverse());
  return (forward + reverse) / 2;
}

/**
 * Map an MTLD value to the 1–5 Range dimension. Anchored thresholds picked
 * to keep typical persona seeds (50–200 tokens) inside the 2–4 band so the
 * extremes carry signal:
 *
 *   <  35   → 1   (single-template prose, e.g., "I am a roaster who roasts")
 *   < 55   → 2
 *   < 80   → 3   (median expected band)
 *   < 110  → 4
 *   ≥ 110  → 5   (genuinely rich vocab, citation-heavy)
 *
 * `minTokens` guard returns the neutral score 3 for seeds below the
 * algorithm's reliability threshold rather than reporting wobble.
 */
export function mtldToRangeScore(text: string, minTokens = 30): 1 | 2 | 3 | 4 | 5 {
  const tokens = tokenize(text);
  if (tokens.length < minTokens) return 3;
  const v = computeMTLD(text);
  if (v < 35) return 1;
  if (v < 55) return 2;
  if (v < 80) return 3;
  if (v < 110) return 4;
  return 5;
}
