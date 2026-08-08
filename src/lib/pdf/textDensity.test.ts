import { describe, it, expect } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import { assessTextLayer, shouldOcr } from "./textDensity";
import type { PdfTextItem } from "./extractPageText";
import { frameFromMatrix } from "./geometry";

// US Letter at scale 1: 612x792 points.
const LETTER = { width: 612, height: 792, scale: 1 } as PageViewport;

/** A text item of `text` at font size 10, `x` points along the baseline. */
function item(text: string, x = 0, y = 100): PdfTextItem {
  // Roughly 0.5em per character, which is a fair average advance width.
  const width = text.length * 5;
  return {
    str: text,
    start: 0,
    end: text.length,
    transform: [10, 0, 0, 10, x, y],
    width,
    height: 10,
    fontName: "f1",
    frame: frameFromMatrix([10, 0, 0, -10, x, y], width, 1),
    rtl: false,
  };
}

function paragraphs(lines: number, charsPerLine: number): PdfTextItem[] {
  return Array.from({ length: lines }, (_, i) =>
    item("x".repeat(charsPerLine), 20, 60 + i * 14)
  );
}

describe("assessTextLayer", () => {
  it("calls a page with no text a scan", () => {
    const verdict = assessTextLayer([], LETTER);
    expect(verdict.charCount).toBe(0);
    expect(verdict.looksScanned).toBe(true);
    expect(shouldOcr(verdict)).toBe(true);
  });

  // The bug this replaces: `items.length === 0` meant a scanned page carrying a
  // single stamped header or page number skipped OCR entirely, leaving the whole
  // scanned body unredacted.
  it("still calls a scan a scan when it carries one stray text stamp", () => {
    const verdict = assessTextLayer([item("Page 1 of 1")], LETTER);
    expect(verdict.looksScanned).toBe(true);
    expect(shouldOcr(verdict)).toBe(true);
  });

  it("does not call a full page of text a scan", () => {
    const verdict = assessTextLayer(paragraphs(40, 80), LETTER);
    expect(verdict.looksScanned).toBe(false);
    expect(verdict.charCount).toBe(3200);
    expect(shouldOcr(verdict)).toBe(false);
  });

  it("treats a page with only a few labels as a scan outright", () => {
    const verdict = assessTextLayer(paragraphs(6, 20), LETTER);
    expect(verdict.looksScanned).toBe(true);
    expect(shouldOcr(verdict)).toBe(true);
  });

  // The regression that motivated simplifying this: a real two-page lab report
  // was being sent to OCR, turning a ~1s redaction into ~20s for no benefit.
  it("does not send a sparsely laid-out but genuine text page to OCR", () => {
    const verdict = assessTextLayer(paragraphs(20, 60), LETTER);
    expect(verdict.looksScanned).toBe(false);
    expect(shouldOcr(verdict)).toBe(false);
  });

  it("reports the glyph coverage ratio without thresholding on it", () => {
    // Kept for display and diagnostics. It is not a usable "mostly image"
    // signal — see the comment at the top of textDensity.ts.
    const verdict = assessTextLayer(paragraphs(40, 80), LETTER);
    expect(verdict.textAreaRatio).toBeGreaterThan(0);
    expect(verdict.textAreaRatio).toBeLessThan(1);
  });

  it("ignores whitespace-only items when counting characters", () => {
    expect(assessTextLayer([item("   "), item("  ")], LETTER).charCount).toBe(0);
  });

  it("measures density per page area, not per item count", () => {
    const small = { width: 200, height: 200, scale: 1 } as PageViewport;
    const items = paragraphs(8, 30);
    // The same text is dense on a small page and sparse on a large one.
    expect(assessTextLayer(items, small).charsPerSqIn).toBeGreaterThan(
      assessTextLayer(items, LETTER).charsPerSqIn
    );
  });

  it("is scale-invariant, so the render scale cannot change the verdict", () => {
    const items = paragraphs(40, 80);
    const at1 = assessTextLayer(items, LETTER);
    const at2 = assessTextLayer(items, {
      width: 1224,
      height: 1584,
      scale: 2,
    } as PageViewport);
    expect(at2.looksScanned).toBe(at1.looksScanned);
    expect(Math.round(at2.charsPerSqIn)).toBe(Math.round(at1.charsPerSqIn));
  });
});
