import type { RedactionResult, RedactionSummary } from "../../types";
import { matchId, REDACTED } from "../redaction/redact";
import { decodeTextFile, encodeText, type TextEncodingId } from "./decodeText";
import { parseCsv, csvTextView, serializeCsv, type CsvDoc } from "./csv";
import {
  viewRangeToSource,
  type SourceSpan,
  type TextView,
} from "../pipeline/offsetMap";
import type { FormatId } from "./sniff";

export interface ProcessedTextFile {
  blob: Blob;
  summary: RedactionSummary;
  warnings: { code: string; detail: string }[];
  /**
   * The decoded source text the detectors ran on. Surfaced so the review screen
   * can show the document with matches highlighted in place, and so a manual
   * selection maps to the same offsets the pipeline uses.
   */
  sourceText: string;
}

/** Runs detection on a string. Supplied by the caller so it can go via the worker. */
export type Redactor = (text: string) => Promise<RedactionResult>;

export async function redactTextFile(
  file: File,
  redact: Redactor,
  formatId: FormatId = "text",
  mimeType?: string,
  forcedEncoding?: TextEncodingId
): Promise<ProcessedTextFile> {
  const decoded = await decodeTextFile(file, forcedEncoding);
  const warnings: { code: string; detail: string }[] = [];

  if (decoded.guessed) {
    warnings.push({
      code: "encoding-guessed",
      detail: `This file isn't valid UTF-8, so it was read as ${decoded.encoding}. If the text below looks garbled, that guess was wrong.`,
    });
  }

  const type = mimeType || file.type || "text/plain";

  if (formatId === "csv") {
    const csv = await redactCsv(decoded.text, redact, decoded.hadBom, type);
    // The review text for a CSV is the flattened cell view the detectors saw,
    // not the raw file — offsets must line up with the matches.
    return { ...csv, warnings };
  }

  const { redactedText, summary } = await redact(decoded.text);
  const blob = new Blob([encodeText(redactedText, decoded.hadBom)], { type });
  return { blob, summary, warnings, sourceText: decoded.text };
}

/**
 * CSV is rebuilt field by field rather than by splicing the raw text, so a
 * replacement can never break the row structure: each field is re-emitted from
 * its (possibly redacted) logical value and re-quoted according to what it now
 * contains.
 */
async function redactCsv(
  text: string,
  redact: Redactor,
  hadBom: boolean,
  mimeType: string
): Promise<{ blob: Blob; summary: RedactionSummary; sourceText: string }> {
  const doc = parseCsv(text);
  const view = csvTextView(doc);

  const { summary, matches } = await redact(view.text);

  // Replacements come from the summary rather than being hardcoded, so the
  // chosen mode (labels, pseudonyms) reaches the file and the panel and the
  // output cannot disagree.
  // Kept items are listed but not redacted, so they must not contribute a
  // replacement here.
  const replacements = new Map(
    summary.items.filter((item) => !item.kept).map((item) => [item.id, item.replacement])
  );

  // Build each affected cell's new value from its own matches. Working per cell
  // keeps offsets local, so a match spanning two cells (a name split across a
  // First/Last column pair) redacts the right part of each.
  const perCell = new Map<number, { value: string; cuts: { start: number; end: number; with: string }[] }>();

  for (const match of matches) {
    const replacement = replacements.get(matchId(match)) ?? REDACTED;
    for (const span of spansForMatch(view, doc, match.start, match.end)) {
      const cell = doc.cells[span.ref];
      if (!cell) continue;
      const entry = perCell.get(span.ref) ?? { value: cell.value, cuts: [] };
      entry.cuts.push({ start: span.fragStart, end: span.fragEnd, with: replacement });
      perCell.set(span.ref, entry);
    }
  }

  const newValues = new Map<number, string>();
  for (const [ref, entry] of perCell) {
    newValues.set(ref, applyCuts(entry.value, entry.cuts));
  }

  const output = serializeCsv(doc, newValues);
  return {
    blob: new Blob([encodeText(output, hadBom)], { type: mimeType }),
    summary,
    sourceText: view.text,
  };
}


/**
 * Which cells a match should actually redact.
 *
 * Cells are joined with a space for detection so that a name split across a
 * First/Last column pair is still recognised as one person. The cost is that the
 * NLP detector also merges across boundaries where it shouldn't: given cells
 * "Smith, John" and "Called about...", it reads "John Called" as a name and the
 * word "Called" — ordinary data in a different column — gets redacted too.
 *
 * So a match keeps its anchor cell (the one it starts in) unconditionally, and
 * extends into later cells only when it covers that cell's value in full. A
 * genuine First/Last pair covers both cells completely and survives; a name
 * bleeding one word into a neighbouring sentence does not.
 *
 * The residual risk is a multi-cell value where the later cell is only partly
 * matched (a surname column holding "Roe Jr"), which would be left alone. That
 * is rarer, and far less damaging, than corrupting a column on every file.
 */
function spansForMatch(
  view: TextView,
  doc: CsvDoc,
  start: number,
  end: number
): SourceSpan[] {
  const spans = viewRangeToSource(view, start, end);
  if (spans.length <= 1) return spans;

  return spans.filter((span, index) => {
    if (index === 0) return true;
    const cell = doc.cells[span.ref];
    if (!cell) return false;
    const covered = cell.value.slice(span.fragStart, span.fragEnd);
    return covered.trim() === cell.value.trim();
  });
}

/** Apply non-overlapping replacements to a string, right to left. */
function applyCuts(
  value: string,
  cuts: { start: number; end: number; with: string }[]
): string {
  const sorted = [...cuts].sort((a, b) => b.start - a.start);
  let out = value;
  let lastStart = Number.POSITIVE_INFINITY;

  for (const cut of sorted) {
    // Defensive: resolveOverlaps guarantees non-overlapping spans, but a cell can
    // receive spans from two different matches, so skip anything that would
    // corrupt an already-applied edit.
    if (cut.end > lastStart) continue;
    out = out.slice(0, cut.start) + cut.with + out.slice(cut.end);
    lastStart = cut.start;
  }

  return out;
}
