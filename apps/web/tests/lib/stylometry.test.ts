import { describe, expect, it } from "vitest";
import { computeMTLD, mtldToRangeScore, tokenize } from "@/lib/stylometry/mtld";
import {
  averageConcreteness,
  concretenessToScore,
  tableCoverage,
} from "@/lib/stylometry/brysbaert";

describe("MTLD", () => {
  it("tokenize lowercases, strips punctuation, drops noise", () => {
    expect(tokenize("Hello, World! It's fine.")).toEqual([
      "hello",
      "world",
      "it's",
      "fine",
    ]);
  });

  it("repetitive copy lands in the low band", () => {
    const repetitive =
      "the the the the the cat cat cat cat sat sat sat sat there there there there";
    expect(computeMTLD(repetitive)).toBeLessThan(35);
  });

  it("diverse copy lands above the repetition floor", () => {
    // Mostly-unique tokens with light function-word reuse — typical of
    // careful prose. We assert above the 1-band threshold (35) rather
    // than chasing a literal MTLD magnitude, since for short fully-unique
    // text the algorithm asymptotes at the token count.
    const diverse =
      "obsidian rhetoric crystallizes around concrete imagery, leveraging tactile metaphor against vague abstractions, weaving syllogistic momentum, deploying surgical asides, marshalling citations, anchoring claims, dismantling premises, pirouetting through counterexamples, reinforcing structure, accelerating tempo, escalating stakes, landing precise body blows beneath polished verbal armor";
    expect(computeMTLD(diverse)).toBeGreaterThan(35);
  });

  it("short text under minTokens falls back to neutral score 3", () => {
    expect(mtldToRangeScore("just a tiny seed", 30)).toBe(3);
  });

  it("repetitive long copy maps to a low Range score", () => {
    const long = ("the cat sat the cat sat the cat sat ").repeat(8).trim();
    const score = mtldToRangeScore(long, 5);
    expect(score).toBeLessThanOrEqual(2);
  });
});

describe("Brysbaert concreteness", () => {
  it("recognizes concrete words from the seed table", () => {
    const avg = averageConcreteness("the cat sat on the table near the door");
    expect(avg).not.toBeNull();
    expect(avg!).toBeGreaterThan(4.0); // cat 4.97, table 4.85, door 4.93
  });

  it("abstract prose scores low", () => {
    const avg = averageConcreteness(
      "truth justice freedom logic reason wisdom virtue principle",
    );
    expect(avg).not.toBeNull();
    expect(avg!).toBeLessThan(2.5);
  });

  it("concrete prose maps to a high Concreteness score", () => {
    expect(
      concretenessToScore(
        "the sword glints, salt on the wind, blood on the stone, bone in the dirt",
      ),
    ).toBeGreaterThanOrEqual(4);
  });

  it("abstract prose maps to a low Concreteness score", () => {
    expect(
      concretenessToScore(
        "the truth of reason in the form of justice and the principle of logic",
      ),
    ).toBeLessThanOrEqual(2);
  });

  it("text with zero table matches falls back to neutral score 3", () => {
    expect(concretenessToScore("zzz qqq xxx yyy")).toBe(3);
  });

  it("coverage reports table hit rate", () => {
    const cov = tableCoverage("the cat sat on the table");
    expect(cov).toBeGreaterThan(0); // at least cat + table hit
    expect(cov).toBeLessThanOrEqual(1);
  });
});
