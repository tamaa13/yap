// Mock score derivation for the pre-Phase-4 mint UI. Lets the score-first
// → archetype-second flow render meaningfully before yap-contracts ships
// the on-chain trait-recording cascade. Once Phase 4 lands the real
// `lib/0g/score-persona.ts` server call, swap the wire at the mint-page
// fetch site — the rest of the UI is identical.
//
// Heuristics chosen to give *plausibly* differentiated 5-tuples from the
// kind of free-text persona seeds users actually type. Not load-bearing
// — never settle on-chain off these; they're UI placeholders.

import { mtldToRangeScore } from "./mtld";
import { concretenessToScore } from "./brysbaert";

export type ScoreFive = 1 | 2 | 3 | 4 | 5;
export interface MockScores {
  logos: ScoreFive;
  rhetoric: ScoreFive;
  aggression: ScoreFive;
  range: ScoreFive;
  concreteness: ScoreFive;
}

function clampToScore(value: number): ScoreFive {
  if (value <= 1.5) return 1;
  if (value <= 2.5) return 2;
  if (value <= 3.5) return 3;
  if (value <= 4.5) return 4;
  return 5;
}

/** Logos proxy: connector density + sentence count. Real LLM judge looks
 *  for premise→conclusion linkage; this approximation rewards seeds that
 *  use "because / therefore / since / so that" and have multi-sentence
 *  structure (vs. a one-liner). */
function logosScore(seed: string): ScoreFive {
  const lower = seed.toLowerCase();
  const connectors = [
    "because",
    "therefore",
    "since",
    "thus",
    "hence",
    "so that",
    "given that",
    "as a result",
    "consequently",
  ];
  let hits = 0;
  for (const c of connectors) hits += (lower.split(c).length - 1);
  const sentences = seed.split(/[.!?]+/).filter((s) => s.trim().length > 4).length;
  const wordCount = seed.split(/\s+/).filter((w) => w.length > 1).length || 1;
  const connectorRate = hits / Math.max(1, wordCount / 50); // hits per ~50 tokens
  // Baseline 2; +1 for any connector signal, +1 for multi-sentence, +1 for
  // generous mix. Caps at 5.
  let raw = 2 + (connectorRate > 0 ? 1 : 0) + (sentences >= 3 ? 1 : 0);
  if (connectorRate >= 1) raw += 1;
  return clampToScore(raw);
}

/** Rhetoric proxy: simile / metaphor markers + adjective density. Real
 *  judge weighs vividness + figurative effectiveness; we approximate
 *  with "like a", "as if", em-dashes, and the ratio of -ly / -ing /
 *  -ous suffixes that often flag descriptive prose. */
function rhetoricScore(seed: string): ScoreFive {
  const lower = seed.toLowerCase();
  const simileLike = (lower.match(/\blike (?:a|an|the)\b/g) ?? []).length;
  const asIf = (lower.match(/\bas if\b/g) ?? []).length;
  const emDashes = (seed.match(/—|--/g) ?? []).length;
  const colourSuffixes = (
    lower.match(/\b\w+(?:ly|ous|ing|esque)\b/g) ?? []
  ).length;
  const words = seed.split(/\s+/).filter((w) => w.length > 1).length || 1;
  const colourRate = colourSuffixes / words; // 0..1-ish
  let raw = 2;
  if (simileLike > 0 || asIf > 0 || emDashes > 0) raw += 1;
  if (colourRate > 0.08) raw += 1;
  if (colourRate > 0.16) raw += 1;
  return clampToScore(raw);
}

/** Aggression proxy: hedge-token ratio (inverted) + uppercase emphasis.
 *  Real judge measures stance strength against hedge density; we count
 *  "maybe / perhaps / possibly / kind of / sort of / I think" against
 *  total tokens, and tip up on ALL-CAPS or trailing punch ("!"). */
function aggressionScore(seed: string): ScoreFive {
  const lower = seed.toLowerCase();
  const hedges = [
    "maybe",
    "perhaps",
    "possibly",
    "kind of",
    "sort of",
    "i think",
    "i guess",
    "somewhat",
    "fairly",
    "rather",
    "might",
  ];
  let hedgeHits = 0;
  for (const h of hedges) hedgeHits += lower.split(h).length - 1;
  const words = seed.split(/\s+/).filter((w) => w.length > 1).length || 1;
  const hedgeRate = hedgeHits / words;
  const upperRuns = (seed.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  const bangs = (seed.match(/!/g) ?? []).length;
  // Start neutral. Heavy hedging drops; emphasis pulls up.
  let raw = 3;
  if (hedgeRate > 0.05) raw -= 1;
  if (hedgeRate > 0.1) raw -= 1;
  if (upperRuns > 0) raw += 1;
  if (bangs >= 3) raw += 1;
  return clampToScore(raw);
}

/**
 * Derive a five-tuple score from a free-text seed. Stylometric pair
 * (Range / Concreteness) pulls from the same helpers the real
 * score-persona module uses, so Phase 4 swap-in keeps those two
 * deterministic. The LLM-judged trio (Logos / Rhetoric / Aggression)
 * runs through these heuristics until the real call wires.
 */
export function deriveMockScores(seed: string): MockScores {
  return {
    logos: logosScore(seed),
    rhetoric: rhetoricScore(seed),
    aggression: aggressionScore(seed),
    range: mtldToRangeScore(seed),
    concreteness: concretenessToScore(seed),
  };
}
