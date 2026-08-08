import { describe, it, expect } from "vitest";
import type * as Tesseract from "tesseract.js";
import { flattenWords, ocrBoxesForMatch, lowConfidenceSpans } from "./ocrText";
import type { PIIMatch } from "../../types";

/** Minimal stand-in for Tesseract's block > paragraph > line > word tree. */
function page(lines: Array<Array<[string, number?]>>): Tesseract.Page {
  let x = 0;
  return {
    blocks: [
      {
        paragraphs: lines.map((words) => ({
          lines: [
            {
              words: words.map(([text, confidence = 95]) => {
                const bbox = { x0: x, y0: 0, x1: x + text.length * 8, y1: 20 };
                x += text.length * 8 + 8;
                return { text, confidence, bbox };
              }),
            },
          ],
        })),
      },
    ],
  } as unknown as Tesseract.Page;
}

const match = (start: number, end: number): PIIMatch => ({
  category: "email",
  start,
  end,
  text: "",
});

describe("flattenWords", () => {
  it("joins words on a line with single spaces", () => {
    const { text } = flattenWords(page([[["Jane"], ["Doe"]]]));
    expect(text).toBe("Jane Doe\n");
  });

  it("separates lines with a newline and no stray space", () => {
    // The newline keeps the NLP detector from merging a label on one line into
    // a name on the next. A space *after* the newline would be harmless for
    // offsets but is still wrong, and used to be emitted.
    const { text } = flattenWords(page([[["Name:"]], [["Jane"], ["Doe"]]]));
    expect(text).toBe("Name:\nJane Doe\n");
  });

  it("gives every word offsets that slice back to its own text", () => {
    const source = page([[["Jane"], ["Doe"]], [["jane@acme.com"]]]);
    const { text, words } = flattenWords(source);
    expect(words.map((w) => text.slice(w.start, w.end))).toEqual([
      "Jane",
      "Doe",
      "jane@acme.com",
    ]);
  });

  it("skips empty words without disturbing offsets", () => {
    const { text, words } = flattenWords(page([[["Jane"], [""], ["Doe"]]]));
    expect(words).toHaveLength(2);
    expect(words.map((w) => text.slice(w.start, w.end))).toEqual(["Jane", "Doe"]);
  });

  it("reports mean confidence", () => {
    const { meanConfidence } = flattenWords(page([[["a", 40], ["b", 80]]]));
    expect(meanConfidence).toBe(60);
  });

  it("reports full confidence for an empty page rather than zero", () => {
    // 0 would trip the low-confidence warning on a page with no text at all,
    // which is misleading — there is nothing to be unconfident about.
    expect(flattenWords(page([])).meanConfidence).toBe(100);
  });
});

describe("ocrBoxesForMatch", () => {
  it("returns the boxes of every word the match touches", () => {
    const { words } = flattenWords(page([[["Jane"], ["Doe"]]]));
    // "ne Do" spans both words.
    expect(ocrBoxesForMatch(match(2, 7), words)).toHaveLength(2);
  });

  it("covers a whole word even when only part of it matched", () => {
    const { words } = flattenWords(page([[["jane@acme.com"]]]));
    const boxes = ocrBoxesForMatch(match(0, 4), words);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toEqual(words[0].bbox);
  });

  it("returns nothing for a match that touches no word", () => {
    const { words } = flattenWords(page([[["Jane"]]]));
    expect(ocrBoxesForMatch(match(100, 110), words)).toHaveLength(0);
  });

  it("does not include a word the match merely abuts", () => {
    const { words } = flattenWords(page([[["Jane"], ["Doe"]]]));
    expect(ocrBoxesForMatch(match(0, 4), words)).toHaveLength(1);
  });
});

describe("lowConfidenceSpans", () => {
  it("returns spans for words below the threshold only", () => {
    const { text, words } = flattenWords(page([[["clear", 95], ["fuzzy", 30]]]));
    const spans = lowConfidenceSpans(words);
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("fuzzy");
  });

  it("honours a custom threshold", () => {
    const { words } = flattenWords(page([[["a", 80]]]));
    expect(lowConfidenceSpans(words, 60)).toHaveLength(0);
    expect(lowConfidenceSpans(words, 90)).toHaveLength(1);
  });
});
