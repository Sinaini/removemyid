import { Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { TextViewBuilder, type TextView } from "../pipeline/offsetMap";
import { frameFromMatrix, itemGap, containsRtl, type ItemFrame } from "./geometry";

export interface PdfTextItem {
  str: string;
  /** Offsets into the flat view text — the slice bounds for box placement. */
  start: number;
  end: number;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  /** Precomputed device-space frame, so callers don't redo the matrix maths. */
  frame: ItemFrame;
  /**
   * True when the run contains right-to-left script. Sub-run slicing is not
   * safe for these (see redactPdf), so they get covered whole.
   */
  rtl: boolean;
}

export interface PdfFontStyle {
  fontFamily: string;
}

export interface PageTextData {
  text: string;
  view: TextView;
  items: PdfTextItem[];
  styles: Record<string, PdfFontStyle>;
}

// A gap wider than this fraction of the em height is a word space. 0.18em is
// comfortably below a real space in every common font while staying above the
// inter-glyph gaps that generators emit as separate items.
const SPACE_GAP_RATIO = 0.18;
// A perpendicular shift over half an em means the baseline moved: a new line.
const LINE_GAP_RATIO = 0.5;
// Numbers get a stricter threshold, because wrongly inserting a space inside
// "054-399" + "0303" would split one phone number into two unmatched halves.
const NUMERIC_GAP_RATIO = 0.35;

const NUMERIC_EDGE_RE = /^[\d.,\-/]+$/;

function endsWithSpace(text: string): boolean {
  return /\s$/.test(text);
}

function startsWithSpace(text: string): boolean {
  return /^\s/.test(text);
}

/**
 * Decide what, if anything, belongs between two adjacent text runs.
 *
 * pdf.js emits one "item" per styling/positioning run, which for many
 * generators means one item per word — sometimes per glyph cluster. The old
 * code concatenated them with no separator at all, so "John" + "Smith" became
 * "JohnSmith" (the name detector then missed it) and two adjacent 8-digit
 * numbers became one 16-digit Luhn candidate (a false positive). Deriving the
 * separator from the actual geometry fixes both directions.
 */
function separatorBetween(
  prev: PdfTextItem,
  prevHadEol: boolean,
  nextFrame: ItemFrame,
  nextStr: string
): string {
  if (prevHadEol) return "\n";

  const gap = itemGap(prev.frame, nextFrame);

  // A changed baseline is a line break regardless of horizontal position.
  if (gap.across > LINE_GAP_RATIO * prev.frame.emDev) return "\n";

  // Many generators already emit explicit space items or pad the run text.
  // Adding another space here would double it and shift every subsequent
  // offset, which is the one thing this function must never do.
  if (endsWithSpace(prev.str) || startsWithSpace(nextStr)) return "";

  // Zero or negative advance means kerning or an overlapping run: same word.
  if (gap.along <= 0) return "";

  const bothNumeric = NUMERIC_EDGE_RE.test(prev.str) && NUMERIC_EDGE_RE.test(nextStr);
  const ratio = bothNumeric ? NUMERIC_GAP_RATIO : SPACE_GAP_RATIO;

  return gap.along > ratio * prev.frame.emDev ? " " : "";
}

export async function extractPageText(
  page: PDFPageProxy,
  viewport: PageViewport
): Promise<PageTextData> {
  const content = await page.getTextContent();
  const builder = new TextViewBuilder();
  const items: PdfTextItem[] = [];

  let previous: PdfTextItem | null = null;
  let previousHadEol = false;

  for (const raw of content.items) {
    if (!("str" in raw)) continue;

    if (raw.str.length > 0) {
      const combined = Util.transform(viewport.transform, raw.transform);
      const frame = frameFromMatrix(combined, raw.width, viewport.scale);

      if (previous) {
        const separator = separatorBetween(previous, previousHadEol, frame, raw.str);
        if (separator) builder.pushSeparator(separator);
      }

      // Source offsets are the item's own index: the "source" for a PDF is the
      // item list itself, not a byte range in a file.
      const ref = items.length;
      const start = builder.currentLength;
      builder.push(raw.str, ref, ref + 1, ref);

      const item: PdfTextItem = {
        str: raw.str,
        start,
        end: start + raw.str.length,
        transform: raw.transform,
        width: raw.width,
        height: raw.height,
        fontName: raw.fontName,
        frame,
        rtl: containsRtl(raw.str),
      };
      items.push(item);
      previous = item;
      previousHadEol = false;
    }

    // hasEOL can arrive on an empty item, so it is recorded and applied to the
    // next real run rather than emitted immediately — emitting it here would
    // put a newline before a run that may itself want one.
    if (raw.hasEOL) {
      if (previous) previousHadEol = true;
    }
  }

  const view = builder.build();
  return { text: view.text, view, items, styles: content.styles };
}
