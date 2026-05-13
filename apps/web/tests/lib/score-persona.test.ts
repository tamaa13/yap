import { describe, expect, it } from "vitest";
import {
  aggregate,
  median,
  parseLine,
} from "@/lib/0g/score-persona-aggregate";

describe("parseLine", () => {
  it("parses a well-formed LOGOS line", () => {
    const { score, evidence } = parseLine(
      "LOGOS|4|Premise→conclusion chain with one rebuttal.",
      "logos",
    );
    expect(score).toBe(4);
    expect(evidence).toBe("Premise→conclusion chain with one rebuttal.");
  });

  it("is tolerant of surrounding whitespace + casing", () => {
    expect(parseLine("  rhetoric | 3 | One landed metaphor.  ", "rhetoric"))
      .toMatchObject({ score: 3, evidence: "One landed metaphor." });
  });

  it("rejects out-of-band scores", () => {
    expect(parseLine("AGGRESSION|6|Too bold", "aggression").score).toBeNull();
    expect(parseLine("AGGRESSION|0|Too soft", "aggression").score).toBeNull();
  });

  it("rejects missing evidence segment", () => {
    expect(parseLine("LOGOS|3", "logos").score).toBeNull();
  });

  it("rejects wrong-dimension prefix", () => {
    expect(parseLine("LOGOS|3|valid evidence here", "rhetoric").score).toBeNull();
  });
});

describe("median", () => {
  it("returns the middle integer", () => {
    expect(median([3, 1, 4, 1, 5])).toBe(3);
    expect(median([5, 5, 5, 5, 5])).toBe(5);
  });
  it("clamps to the rubric band", () => {
    // Synthetic input — parseLine already gates 1-5, but median is the
    // last line of defense before the integer hits the canonical text.
    expect(median([6, 6, 6])).toBe(5);
    expect(median([0, 0, 0])).toBe(1);
  });
});

describe("aggregate", () => {
  function attempt(score: number | null, evidence = ""): {
    raw: string;
    score: number | null;
    evidence: string;
  } {
    return {
      raw: `LOGOS|${score ?? "?"}|${evidence}`,
      score,
      evidence,
    };
  }

  it("returns median + low-confidence false when spread < 2", () => {
    const result = aggregate(
      [
        attempt(3, "a"),
        attempt(3, "b"),
        attempt(4, "c"),
        attempt(3, "d"),
        attempt(3, "e"),
      ],
      "logos",
    );
    expect(result.score).toBe(3);
    expect(result.lowConfidence).toBe(false);
    // Evidence comes from the FIRST call at the median score (call
    // order = arbitrary but deterministic tie-break per spec).
    expect(result.evidence).toBe("a");
  });

  it("flips low-confidence when max-min >= 2", () => {
    const result = aggregate(
      [
        attempt(2, "low"),
        attempt(3, "mid"),
        attempt(3, "mid2"),
        attempt(4, "high"),
        attempt(5, "spike"),
      ],
      "logos",
    );
    expect(result.score).toBe(3);
    expect(result.lowConfidence).toBe(true);
  });

  it("tolerates one malformed call", () => {
    const result = aggregate(
      [
        attempt(3, "ok"),
        attempt(4, "ok"),
        attempt(null), // discarded
        attempt(3, "ok"),
        attempt(3, "ok"),
      ],
      "logos",
    );
    expect(result.score).toBe(3);
  });

  it("aborts when 2+ calls malform", () => {
    expect(() =>
      aggregate(
        [
          attempt(3, "ok"),
          attempt(null),
          attempt(null),
          attempt(3, "ok"),
          attempt(3, "ok"),
        ],
        "logos",
      ),
    ).toThrow(/judge_unstable/);
  });

  it("returns lowConfidence false on a perfect run", () => {
    const result = aggregate(
      Array.from({ length: 5 }, () => attempt(5, "max")),
      "aggression",
    );
    expect(result.score).toBe(5);
    expect(result.lowConfidence).toBe(false);
    expect(result.evidence).toBe("max");
  });
});
