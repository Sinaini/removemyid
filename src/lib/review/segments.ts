import type { RedactedItem } from "../../types";

export interface Segment {
  start: number;
  end: number;
  text: string;
  /** Present when this segment is a match; absent for the plain text between. */
  item?: RedactedItem;
}

/**
 * Split the document into alternating plain and matched runs, in one linear
 * pass, so the review screen can render highlights without searching the text
 * per match.
 *
 * Every segment carries its own start offset. That is what lets a DOM selection
 * be mapped back to source offsets by reading one `data-offset` attribute rather
 * than walking and measuring the whole tree — and those offsets have to be the
 * same ones the pipeline used, or a manual redaction would land in the wrong
 * place.
 */
export function buildSegments(
  text: string,
  items: readonly RedactedItem[]
): Segment[] {
  // `resolveOverlaps` already guarantees non-overlapping, ascending spans, but
  // the summary can arrive merged from several PDF pages, so sort defensively —
  // an out-of-order item here would silently drop text from the view.
  const sorted = [...items]
    .filter((item) => item.start < item.end && item.end <= text.length)
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const item of sorted) {
    if (item.start < cursor) continue; // overlaps something already emitted

    if (item.start > cursor) {
      segments.push({
        start: cursor,
        end: item.start,
        text: text.slice(cursor, item.start),
      });
    }

    segments.push({
      start: item.start,
      end: item.end,
      text: text.slice(item.start, item.end),
      item,
    });
    cursor = item.end;
  }

  if (cursor < text.length) {
    segments.push({ start: cursor, end: text.length, text: text.slice(cursor) });
  }

  return segments;
}
