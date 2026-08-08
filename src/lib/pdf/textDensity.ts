import type { PageViewport } from "pdfjs-dist";
import type { PdfTextItem } from "./extractPageText";

// Deciding whether a PDF page needs OCR.
//
// The old rule was `items.length === 0`. That fails on the common case of a
// scanned page whose generator stamped a header, a page number, or a
// "Confidential" watermark as real text: one stray item made the page look like
// it had a text layer, OCR was skipped, and the entire scanned body went
// unredacted. Measuring how much text there is, rather than whether there is
// any, closes that.
//
// A note on what is deliberately NOT attempted. It is tempting to add a middle
// band for "has real text but is still mostly an image" — a photo with a typed
// caption, or a form whose filled fields are scanned. There is no honest way to
// compute that from the text layer, because the text layer says nothing about
// the image layer. `textAreaRatio` looks like the right signal but isn't: for a
// fixed font size it is very nearly a linear function of `charsPerSqIn` (each
// character covers about one em box), so it distinguishes large type from small
// type rather than text from imagery. An earlier version of this file used it as
// a second condition and classified a normal two-page lab report as borderline,
// turning a ~1s redaction into ~20s of pointless OCR.
//
// So there is one threshold, it is conservative, and pages that clear it are
// trusted. The cost of being wrong is bounded by the fact that the user can add
// a redaction by hand on the review screen.

export interface DensityVerdict {
  charCount: number;
  /** Characters per square inch of page (a PDF point is 1/72 inch). */
  charsPerSqIn: number;
  /** Fraction of the page area covered by glyph boxes. Reported, not thresholded. */
  textAreaRatio: number;
  /** Too little text to be the page's real content — read it with OCR too. */
  looksScanned: boolean;
}

// A page with fewer characters than this is a scan with a stamp on it, whatever
// its area.
const MIN_CHARS = 40;
// Ordinary body text runs 30-45 characters per square inch; a sparsely laid out
// title page or a wide table can reach 10-15. Below 8 there is not enough text
// for it to be the page's content.
const MIN_CHARS_PER_SQ_IN = 8;

export function assessTextLayer(
  items: readonly PdfTextItem[],
  viewport: PageViewport
): DensityVerdict {
  let charCount = 0;
  let textArea = 0;

  for (const item of items) {
    charCount += item.str.trim().length;
    // widthDev/emDev are already in device pixels, matching the viewport size.
    textArea += item.frame.widthDev * item.frame.emDev;
  }

  const pageAreaPx = Math.max(1, viewport.width * viewport.height);
  const pageAreaSqIn = Math.max(
    0.01,
    (viewport.width / viewport.scale / 72) * (viewport.height / viewport.scale / 72)
  );

  const charsPerSqIn = charCount / pageAreaSqIn;

  return {
    charCount,
    charsPerSqIn,
    textAreaRatio: textArea / pageAreaPx,
    looksScanned: charCount < MIN_CHARS || charsPerSqIn < MIN_CHARS_PER_SQ_IN,
  };
}

/** Whether this page should also be read with OCR. */
export function shouldOcr(verdict: DensityVerdict): boolean {
  return verdict.looksScanned;
}
