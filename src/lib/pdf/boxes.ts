import type { PIIMatch } from "../../types";
import type { PdfTextItem, PdfFontStyle } from "./extractPageText";
import { quadFor, type Quad } from "./geometry";

// Turning a character range in the page's flat text into black boxes on the
// canvas.
//
// Deliberately does not take a CanvasRenderingContext2D: the only thing it
// needs from the canvas is text measurement, so it asks for that and nothing
// else. That keeps the placement logic — the part that was silently drawing
// boxes in the wrong place on rotated and right-to-left pages — testable
// without a DOM.

/** The slice of canvas text metrics this module actually needs. */
export interface TextMeasurer {
  setFont(font: string): void;
  measure(text: string): number;
}

/** Fraction of the em the box extends above the baseline (over cap height). */
const ASCENT_RATIO = 0.88;
/** And below it, for descenders. */
const DESCENT_RATIO = 0.26;
/** Horizontal padding as a fraction of the em, so it scales with text size. */
const HORIZONTAL_PAD_RATIO = 0.12;

export interface MatchBoxes {
  quads: Quad[];
  /**
   * True when at least one run was covered in full rather than sliced, because
   * it contains right-to-left text.
   */
  usedWholeRun: boolean;
}

/**
 * Where a substring of an item starts and ends along the text advance, in
 * canvas pixels.
 *
 * The browser substitutes a different font from the PDF's embedded one, so
 * measurement is only approximately right. Rescaling by the ratio of pdf.js's
 * authoritative advance width to the measured full-string width corrects most of
 * that, and the padding absorbs the rest. Over-covering by a couple of pixels is
 * the safe direction for a redaction tool.
 */
function measureRun(
  measurer: TextMeasurer,
  item: PdfTextItem,
  styles: Record<string, PdfFontStyle>,
  charStart: number,
  charEnd: number
): { startPx: number; endPx: number } {
  const fontFamily = styles[item.fontName]?.fontFamily || "sans-serif";
  measurer.setFont(`${item.frame.emDev}px ${fontFamily}`);

  const measuredFull = measurer.measure(item.str) || 1;
  const correction = item.frame.widthDev / measuredFull;
  const pad = item.frame.emDev * HORIZONTAL_PAD_RATIO;

  return {
    startPx: measurer.measure(item.str.slice(0, charStart)) * correction - pad,
    endPx: measurer.measure(item.str.slice(0, charEnd)) * correction + pad,
  };
}

export function quadsForMatch(
  measurer: TextMeasurer,
  match: Pick<PIIMatch, "start" | "end">,
  items: readonly PdfTextItem[],
  styles: Record<string, PdfFontStyle>
): MatchBoxes {
  const quads: Quad[] = [];
  let usedWholeRun = false;

  for (const item of items) {
    if (item.start >= match.end || item.end <= match.start) continue;

    // Right-to-left runs are covered whole rather than sliced. Text measurement
    // accumulates left-to-right from the pen origin, which for a bidi run does
    // not correspond to visual order — slicing put the box beside the text
    // rather than over it. Hebrew is a supported language here, so silently
    // mis-placing those boxes was a real leak. Whole-run coverage is coarser but
    // correct, and over-covering is the safe failure mode.
    const wholeItem = item.rtl;
    if (wholeItem) usedWholeRun = true;

    const charStart = wholeItem ? 0 : Math.max(item.start, match.start) - item.start;
    const charEnd = wholeItem
      ? item.str.length
      : Math.min(item.end, match.end) - item.start;

    const { startPx, endPx } = measureRun(measurer, item, styles, charStart, charEnd);

    quads.push(
      quadFor(
        item.frame,
        startPx,
        endPx,
        item.frame.emDev * ASCENT_RATIO,
        item.frame.emDev * DESCENT_RATIO
      )
    );
  }

  return { quads, usedWholeRun };
}

/** Adapts a real canvas context to the measurement interface above. */
export function canvasMeasurer(ctx: CanvasRenderingContext2D): TextMeasurer {
  return {
    setFont: (font) => {
      ctx.font = font;
    },
    measure: (text) => ctx.measureText(text).width,
  };
}
