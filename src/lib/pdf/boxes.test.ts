import { describe, it, expect } from "vitest";
import { quadsForMatch, type TextMeasurer } from "./boxes";
import { frameFromMatrix, type Quad } from "./geometry";
import type { PdfTextItem } from "./extractPageText";

// A monospace measurer: every character is half an em wide. Deterministic, and
// it means the expected geometry can be computed by hand.
const CHAR_RATIO = 0.5;
function fakeMeasurer(): TextMeasurer {
  let em = 10;
  return {
    setFont(font) {
      em = Number.parseFloat(font);
    },
    measure(text) {
      return text.length * em * CHAR_RATIO;
    },
  };
}

const styles = { f1: { fontFamily: "monospace" } };

/**
 * A text item at font size `em`, starting at (`x`, `y`) in canvas space, with
 * `rotated` producing text that advances *down* the canvas instead of right.
 */
function makeItem(
  str: string,
  start: number,
  opts: { x?: number; y?: number; em?: number; rotated?: boolean; rtl?: boolean } = {}
): PdfTextItem {
  const { x = 0, y = 100, em = 10, rotated = false, rtl = false } = opts;
  const width = str.length * em * CHAR_RATIO;
  const combined = rotated ? [0, em, em, 0, x, y] : [em, 0, 0, -em, x, y];

  return {
    str,
    start,
    end: start + str.length,
    transform: combined,
    width,
    height: em,
    fontName: "f1",
    frame: frameFromMatrix(combined, width, 1),
    rtl,
  };
}

/** Axis-aligned bounds of a quad, for containment assertions. */
function bounds(quad: Quad) {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function area(quad: Quad): number {
  const b = bounds(quad);
  return (b.maxX - b.minX) * (b.maxY - b.minY);
}

describe("quadsForMatch — which items participate", () => {
  const items = [makeItem("Jane", 0), makeItem("Doe", 5, { x: 30 })];

  it("boxes only the item the match falls inside", () => {
    expect(quadsForMatch(fakeMeasurer(), { start: 0, end: 4 }, items, styles).quads)
      .toHaveLength(1);
  });

  it("boxes both items when the match spans them", () => {
    expect(quadsForMatch(fakeMeasurer(), { start: 0, end: 8 }, items, styles).quads)
      .toHaveLength(2);
  });

  it("ignores an item the match only abuts", () => {
    // Match ends exactly where "Doe" begins.
    expect(quadsForMatch(fakeMeasurer(), { start: 0, end: 5 }, items, styles).quads)
      .toHaveLength(1);
  });

  it("returns nothing for a match that touches no item", () => {
    expect(quadsForMatch(fakeMeasurer(), { start: 50, end: 60 }, items, styles).quads)
      .toHaveLength(0);
  });
});

describe("quadsForMatch — placement", () => {
  it("covers the matched characters and no more, plus padding", () => {
    const item = makeItem("0123456789", 0, { x: 100, y: 200, em: 20 });
    // Match "456" — characters 4..7, so 40..70px along a 10px-per-char advance.
    const [quad] = quadsForMatch(
      fakeMeasurer(),
      { start: 4, end: 7 },
      [item],
      styles
    ).quads;

    const b = bounds(quad);
    // Padding is 0.12em = 2.4px either side.
    expect(b.minX).toBeCloseTo(100 + 40 - 2.4, 5);
    expect(b.maxX).toBeCloseTo(100 + 70 + 2.4, 5);
    // Vertically: 0.88em above the baseline, 0.26em below.
    expect(b.minY).toBeCloseTo(200 - 17.6, 5);
    expect(b.maxY).toBeCloseTo(200 + 5.2, 5);
  });

  it("covers the whole item when the whole item matched", () => {
    const item = makeItem("secret", 0, { x: 10, y: 50 });
    const [quad] = quadsForMatch(
      fakeMeasurer(),
      { start: 0, end: 6 },
      [item],
      styles
    ).quads;
    const b = bounds(quad);
    expect(b.minX).toBeLessThan(10);
    expect(b.maxX).toBeGreaterThan(10 + item.frame.widthDev);
  });

  it("clips a match that extends past the item to the item's own extent", () => {
    const item = makeItem("abcd", 0, { x: 0, y: 100 });
    const [quad] = quadsForMatch(
      fakeMeasurer(),
      { start: 2, end: 999 },
      [item],
      styles
    ).quads;
    expect(bounds(quad).maxX).toBeLessThanOrEqual(item.frame.widthDev + 2);
  });

  // The bug: the old code used only the translation part of the text matrix, so
  // a rotated run got an axis-aligned box at the right origin pointing the wrong
  // way — it missed the text entirely while the summary reported success.
  it("rotates the box with the text instead of staying axis-aligned", () => {
    const item = makeItem("0123456789", 0, { x: 100, y: 200, rotated: true });
    const [quad] = quadsForMatch(
      fakeMeasurer(),
      { start: 4, end: 7 },
      [item],
      styles
    ).quads;

    const b = bounds(quad);
    // Text advances down the canvas, so the covered span is in Y, not X.
    expect(b.maxY - b.minY).toBeGreaterThan(b.maxX - b.minX);
    expect(b.minY).toBeCloseTo(200 + 20 - 1.2, 5);
    expect(b.maxY).toBeCloseTo(200 + 35 + 1.2, 5);
  });

  it("puts the rotated box over the run, not beside it", () => {
    const rotated = makeItem("0123456789", 0, { x: 100, y: 200, rotated: true });
    const upright = makeItem("0123456789", 0, { x: 100, y: 200 });

    const r = bounds(quadsForMatch(fakeMeasurer(), { start: 0, end: 10 }, [rotated], styles).quads[0]);
    const u = bounds(quadsForMatch(fakeMeasurer(), { start: 0, end: 10 }, [upright], styles).quads[0]);

    // Same origin, same run, but the two boxes must not be the same shape —
    // if they were, rotation was being ignored.
    expect([r.minX, r.maxX, r.minY, r.maxY]).not.toEqual([u.minX, u.maxX, u.minY, u.maxY]);
    // The rotated box must actually contain the rotated run's midpoint.
    expect(r.minY).toBeLessThan(200 + 25);
    expect(r.maxY).toBeGreaterThan(200 + 25);
  });

  it("scales the box with the font size", () => {
    const small = makeItem("abcd", 0, { em: 10 });
    const large = makeItem("abcd", 0, { em: 30 });
    const a = quadsForMatch(fakeMeasurer(), { start: 0, end: 4 }, [small], styles).quads[0];
    const b = quadsForMatch(fakeMeasurer(), { start: 0, end: 4 }, [large], styles).quads[0];
    expect(area(b)).toBeGreaterThan(area(a) * 4);
  });
});

describe("quadsForMatch — right-to-left runs", () => {
  const hebrew = makeItem("שלום עולם", 0, { x: 50, y: 100, rtl: true });

  it("covers the whole run rather than slicing it", () => {
    // Slicing an RTL run by left-to-right measurement places the box beside the
    // text. Covering the run in full is coarser but actually correct.
    const partial = quadsForMatch(fakeMeasurer(), { start: 0, end: 4 }, [hebrew], styles);
    const full = quadsForMatch(fakeMeasurer(), { start: 0, end: 9 }, [hebrew], styles);

    expect(partial.usedWholeRun).toBe(true);
    expect(area(partial.quads[0])).toBeCloseTo(area(full.quads[0]), 5);
  });

  it("reports that whole-run coverage was used, so the UI can say so", () => {
    expect(quadsForMatch(fakeMeasurer(), { start: 2, end: 3 }, [hebrew], styles).usedWholeRun)
      .toBe(true);
  });

  it("does not report whole-run coverage for left-to-right text", () => {
    const latin = makeItem("Patient name", 0);
    expect(quadsForMatch(fakeMeasurer(), { start: 0, end: 4 }, [latin], styles).usedWholeRun)
      .toBe(false);
  });

  it("slices neighbouring left-to-right runs normally in a mixed line", () => {
    const items = [makeItem("Name: ", 0), hebrewAt(6)];
    const result = quadsForMatch(fakeMeasurer(), { start: 0, end: 10 }, items, styles);
    expect(result.quads).toHaveLength(2);
    expect(result.usedWholeRun).toBe(true);
  });

  function hebrewAt(start: number): PdfTextItem {
    return makeItem("שלום עולם", start, { x: 110, y: 100, rtl: true });
  }
});

describe("quadsForMatch — font metric correction", () => {
  it("rescales measurement to pdf.js's authoritative advance width", () => {
    // An item whose real advance is twice what the substituted font measures:
    // the box must follow the real width, not the measured one.
    const item = makeItem("abcdef", 0, { x: 0, y: 100 });
    const stretched: PdfTextItem = {
      ...item,
      frame: { ...item.frame, widthDev: item.frame.widthDev * 2 },
    };

    const normal = quadsForMatch(fakeMeasurer(), { start: 0, end: 6 }, [item], styles).quads[0];
    const wide = quadsForMatch(fakeMeasurer(), { start: 0, end: 6 }, [stretched], styles).quads[0];

    expect(bounds(wide).maxX).toBeGreaterThan(bounds(normal).maxX * 1.8);
  });

  it("does not divide by zero on an unmeasurable item", () => {
    const item = makeItem("", 0);
    expect(() =>
      quadsForMatch(fakeMeasurer(), { start: 0, end: 1 }, [item], styles)
    ).not.toThrow();
  });
});
