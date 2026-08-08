import { describe, it, expect } from "vitest";
import type { PIICategory, PIIMatch } from "../../types";
import { resolveOverlaps } from "./overlap";
import { ALL_CATEGORIES } from "./registry";

function m(
  category: PIICategory,
  start: number,
  end: number,
  text = "x".repeat(end - start)
): PIIMatch {
  return { category, start, end, text };
}

/** Union of covered offsets, as a set — the basis of the no-leak property. */
function coveredOffsets(matches: readonly PIIMatch[]): Set<number> {
  const covered = new Set<number>();
  for (const match of matches) {
    for (let i = match.start; i < match.end; i++) covered.add(i);
  }
  return covered;
}

describe("resolveOverlaps — basics", () => {
  it("returns disjoint matches untouched and in start order", () => {
    const text = "a@b.co and 555-0100 here";
    const input = [m("phone", 11, 19), m("email", 0, 6)];
    const out = resolveOverlaps(input, text);
    expect(out.map((x) => [x.category, x.start, x.end])).toEqual([
      ["email", 0, 6],
      ["phone", 11, 19],
    ]);
  });

  it("passes through zero and one match", () => {
    expect(resolveOverlaps([], "abc")).toEqual([]);
    expect(resolveOverlaps([m("email", 0, 3)], "abc")).toHaveLength(1);
  });

  it("always returns non-overlapping, start-ascending spans", () => {
    const text = "z".repeat(60);
    const out = resolveOverlaps(
      [m("person", 0, 20), m("email", 10, 30), m("phone", 25, 40), m("date", 50, 55)],
      text
    );
    for (let i = 1; i < out.length; i++) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end);
    }
  });

  it("keeps every match's text in sync with its span", () => {
    const text = "abcdefghijklmnopqrstuvwxyz";
    const out = resolveOverlaps(
      [m("person", 0, 10), m("place", 5, 20), m("date", 18, 24)],
      text
    );
    for (const match of out) {
      expect(match.text).toBe(text.slice(match.start, match.end));
    }
  });
});

describe("resolveOverlaps — priority", () => {
  // Regression: the old comparator sorted by length before priority, so a long
  // NLP span beat a short precise one and CATEGORY_PRIORITY never applied.
  it("lets a short precise match beat a longer NLP match at the same start", () => {
    const text = "jane@acme.com Corp";
    const out = resolveOverlaps([m("person", 0, 18), m("email", 0, 13)], text);
    expect(out[0].category).toBe("email");
  });

  it("resolves identical spans by priority, not insertion order", () => {
    const text = "123-45-6789";
    const forward = resolveOverlaps([m("ssn", 0, 11), m("phone", 0, 11)], text);
    const reverse = resolveOverlaps([m("phone", 0, 11), m("ssn", 0, 11)], text);
    expect(forward[0].category).toBe("ssn");
    expect(reverse[0].category).toBe("ssn");
  });

  it("keeps the outer span when one match nests inside another", () => {
    const text = "x".repeat(30);
    const out = resolveOverlaps([m("person", 0, 30), m("date", 10, 15)], text);
    expect(out).toHaveLength(1);
    expect([out[0].start, out[0].end]).toEqual([0, 30]);
  });
});

describe("resolveOverlaps — the no-leak guarantee", () => {
  // The verified bug: email[0,10) + person[3,30) + date[11,14) previously kept
  // only email and date, writing offsets 14..30 to the output in the clear.
  it("covers the tail of a partially-overlapping match instead of dropping it", () => {
    const text = "a".repeat(30);
    const input = [m("email", 0, 10), m("person", 3, 30), m("date", 11, 14)];
    const out = resolveOverlaps(input, text);

    const covered = coveredOffsets(out);
    for (let i = 0; i < 30; i++) {
      expect(covered.has(i), `offset ${i} left unredacted`).toBe(true);
    }
  });

  it("never lets the coverage watermark move backwards", () => {
    const text = "b".repeat(120);
    const input = [m("person", 0, 100), m("date", 5, 10), m("age", 12, 15)];
    const covered = coveredOffsets(resolveOverlaps(input, text));
    for (let i = 0; i < 100; i++) {
      expect(covered.has(i), `offset ${i}`).toBe(true);
    }
  });

  it("merges rather than trimming when the cut would land mid-token", () => {
    // "91234567" — a phone claims [0,5), an account number claims [0,8).
    // Trimming the second to [5,8) would emit "[REDACTED]567"-style output.
    const text = "91234567 tail";
    const out = resolveOverlaps([m("phone", 0, 5), m("creditCard", 0, 8)], text);
    const covered = coveredOffsets(out);
    for (let i = 0; i < 8; i++) expect(covered.has(i)).toBe(true);
    // And no span may start in the middle of the digit run.
    for (const match of out) {
      expect(match.start === 0 || match.start >= 8).toBe(true);
    }
  });

  it("trims on a token boundary and reports both categories", () => {
    const text = "New York 10001 rest";
    const out = resolveOverlaps([m("place", 0, 9), m("phone", 8, 14)], text);
    expect(out.map((x) => x.category)).toEqual(["place", "phone"]);
    expect(coveredOffsets(out).has(13)).toBe(true);
  });

  it("merges two same-category matches into one item", () => {
    const text = "c".repeat(20);
    const out = resolveOverlaps([m("phone", 0, 10), m("phone", 6, 18)], text);
    expect(out).toHaveLength(1);
    expect([out[0].start, out[0].end]).toEqual([0, 18]);
  });

  it("drops a remainder that is only punctuation or whitespace", () => {
    const text = "jane@acme.com , ";
    const out = resolveOverlaps([m("email", 0, 13), m("place", 12, 16)], text);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("email");
  });

  // The single most important test in the suite. Whatever the input, no offset
  // that some detector flagged may be missing from the output.
  it("property: output coverage is a superset of input coverage", () => {
    const text = "d".repeat(200);
    // Deterministic pseudo-random spans (no Math.random — reproducibility
    // matters more than novelty for a coverage property).
    let seed = 12345;
    const next = (limit: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % limit;
    };

    for (let round = 0; round < 400; round++) {
      const input: PIIMatch[] = [];
      const count = 1 + next(7);
      for (let i = 0; i < count; i++) {
        const start = next(190);
        const length = 1 + next(25);
        input.push(
          m(
            ALL_CATEGORIES[next(ALL_CATEGORIES.length)],
            start,
            Math.min(200, start + length)
          )
        );
      }

      const out = resolveOverlaps(input, text);
      const before = coveredOffsets(input);
      const after = coveredOffsets(out);
      for (const offset of before) {
        expect(after.has(offset), `round ${round}: offset ${offset} leaked`).toBe(true);
      }

      // And the output must remain usable by the cursor-walk renderer.
      for (let i = 1; i < out.length; i++) {
        expect(out[i].start, `round ${round}: overlap in output`).toBeGreaterThanOrEqual(
          out[i - 1].end
        );
      }
    }
  });
});
