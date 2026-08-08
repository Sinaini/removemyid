import type { ManualSpan, PIIMatch } from "../../types";
import { buildLiteralRegex } from "./literal";

export interface ResolvedManual {
  matches: PIIMatch[];
  /** Spans whose text could no longer be found, so the UI can say so. */
  unresolvedIds: string[];
}

/**
 * Turn user-marked spans into matches for the current text.
 *
 * The whole pipeline re-runs on every change, and OCR in particular is not
 * guaranteed to produce byte-identical text twice, so a manual span cannot
 * simply trust its recorded offsets. The resolution order is:
 *
 *  1. Use the recorded offsets if the text there still matches exactly.
 *  2. Otherwise fall back to the first occurrence of the recorded text.
 *  3. Otherwise report it as unresolved.
 *
 * Step 3 matters: silently dropping a span the user explicitly asked for would
 * remove coverage without telling anyone, which is the failure mode this whole
 * project is about avoiding.
 */
export function resolveManualSpans(
  text: string,
  spans: readonly ManualSpan[],
  page = 0
): ResolvedManual {
  const matches: PIIMatch[] = [];
  const unresolvedIds: string[] = [];

  for (const span of spans) {
    // `page` scopes a span to the PDF page it was drawn on. An "all
    // occurrences" span with page 0 deliberately applies everywhere, so a name
    // marked once is redacted throughout the document.
    const appliesHere = span.page === page || (span.scope === "all" && span.page === 0);
    if (!appliesHere) continue;

    const needle = span.text;
    if (!needle.trim()) continue;

    if (span.scope === "all") {
      const found = allOccurrences(text, needle);
      if (found.length === 0) unresolvedIds.push(span.id);
      matches.push(...found);
      continue;
    }

    if (text.slice(span.start, span.end) === needle) {
      matches.push({ category: "manual", start: span.start, end: span.end, text: needle });
      continue;
    }

    const index = text.indexOf(needle);
    if (index >= 0) {
      matches.push({
        category: "manual",
        start: index,
        end: index + needle.length,
        text: needle,
      });
      continue;
    }

    unresolvedIds.push(span.id);
  }

  return { matches, unresolvedIds };
}

function allOccurrences(text: string, needle: string): PIIMatch[] {
  // Reuses the same word-boundary-aware builder as the "only these values"
  // fields, so "Al" cannot match inside "Alabama" here either.
  const regex = buildLiteralRegex(needle, { wholeWord: true });
  if (!regex) return [];

  const matches: PIIMatch[] = [];
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue;
    matches.push({
      category: "manual",
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return matches;
}
