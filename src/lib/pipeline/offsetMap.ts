// Every input format this app supports has the same shape of problem: the
// document is a sequence of *positioned* text fragments (pdf.js text items,
// Tesseract OCR words, DOCX <w:t> runs, CSV cells, JSON string literals, HTML
// text nodes), but the detectors need one flat string. So we build a flat
// "view" string, run detection on it, and then have to map a match span in
// view space back to the fragments it covers — in order to draw a black box
// over it, or to splice a replacement into the right run.
//
// Getting that mapping wrong is not a cosmetic bug in a redaction tool: an
// off-by-one puts the black box beside the text instead of over it while the
// summary still claims the value was redacted. So the mapping is built once,
// here, and every format reuses it rather than each one re-deriving offsets.
//
// The load-bearing idea is the separator/fragment distinction. Whitespace
// inserted purely to give the detectors sane word boundaries is pushed via
// `pushSeparator` and is deliberately mapped to *nothing*. That's what keeps
// a fragment's `viewStart`/`viewEnd` exactly equal to the slice bounds the
// caller needs, no matter how much glue was inserted around it.

/** One source fragment's placement in the flat view string. */
export interface Segment {
  /** Start offset in whatever coordinate space the caller owns. */
  srcStart: number;
  srcEnd: number;
  /** Start offset in `TextView.text`. */
  viewStart: number;
  viewEnd: number;
  /** Caller-owned index, typically into its own array of items/words/runs. */
  ref: number;
}

export interface TextView {
  /** The flat string the detectors run against. */
  text: string;
  /** Fragments in ascending `viewStart` order. Separators are absent. */
  segments: Segment[];
}

/** A view-space match resolved back onto one source fragment. */
export interface SourceSpan {
  ref: number;
  /** The fragment's own source range, unchanged. */
  srcStart: number;
  srcEnd: number;
  /**
   * The overlapping portion, as offsets *within the fragment's text*
   * (0 = the fragment's first character). This is what a caller slices with.
   */
  fragStart: number;
  fragEnd: number;
}

export class TextViewBuilder {
  private parts: string[] = [];
  private segments: Segment[] = [];
  private length = 0;

  /**
   * Append a fragment of real document text, recording where it came from.
   * Empty fragments are ignored so they can't produce zero-width segments
   * that later confuse overlap tests.
   */
  push(fragment: string, srcStart: number, srcEnd: number, ref: number): void {
    if (fragment.length === 0) return;

    const viewStart = this.length;
    this.parts.push(fragment);
    this.length += fragment.length;

    this.segments.push({
      srcStart,
      srcEnd,
      viewStart,
      viewEnd: this.length,
      ref,
    });
  }

  /**
   * Append glue that exists only to separate fragments for the detectors'
   * benefit — a space between two PDF text runs, a newline between OCR lines.
   * It is never attributed to a source range, so it can never be "redacted"
   * and can never shift a fragment's mapping.
   */
  pushSeparator(separator: string): void {
    if (separator.length === 0) return;
    this.parts.push(separator);
    this.length += separator.length;
  }

  /**
   * Length of the view text so far — i.e. the view offset the next `push` will
   * start at. O(1), unlike joining the parts, which matters because callers
   * read it once per fragment.
   */
  get currentLength(): number {
    return this.length;
  }

  /** The view text built so far. Useful for whitespace-aware separator rules. */
  get currentText(): string {
    return this.parts.length === 1 ? this.parts[0] : this.parts.join("");
  }

  /** True when nothing has been appended yet (no leading separator wanted). */
  get isEmpty(): boolean {
    return this.length === 0;
  }

  build(): TextView {
    return { text: this.parts.join(""), segments: this.segments };
  }
}

/**
 * Every source fragment a view-space range touches, with fragment-local
 * offsets for the overlapping part.
 *
 * Uses a half-open comparison (`viewStart < viewEnd && viewEnd > viewStart`)
 * so a zero-width range matches nothing and a range that merely abuts a
 * fragment doesn't drag it in.
 */
export function viewRangeToSource(
  view: TextView,
  viewStart: number,
  viewEnd: number
): SourceSpan[] {
  if (viewEnd <= viewStart) return [];

  const spans: SourceSpan[] = [];

  // Segments are ascending and non-overlapping, so a binary search for the
  // first candidate keeps this cheap on documents with tens of thousands of
  // fragments (a long PDF page or a large spreadsheet).
  let lo = 0;
  let hi = view.segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (view.segments[mid].viewEnd <= viewStart) lo = mid + 1;
    else hi = mid;
  }

  for (let i = lo; i < view.segments.length; i++) {
    const segment = view.segments[i];
    if (segment.viewStart >= viewEnd) break;

    const overlapStart = Math.max(segment.viewStart, viewStart);
    const overlapEnd = Math.min(segment.viewEnd, viewEnd);
    if (overlapEnd <= overlapStart) continue;

    spans.push({
      ref: segment.ref,
      srcStart: segment.srcStart,
      srcEnd: segment.srcEnd,
      fragStart: overlapStart - segment.viewStart,
      fragEnd: overlapEnd - segment.viewStart,
    });
  }

  return spans;
}
