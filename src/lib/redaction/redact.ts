import type {
  PIICategory,
  PIIMatch,
  RedactionOptions,
  RedactionResult,
  RedactionSummary,
  ReplacementMode,
  ManualSpan,
} from "../../types";
import { resolveManualSpans } from "./manual";
import { ALL_CATEGORIES, CATEGORY_DEFS } from "./registry";
import { defaultRedactionOptions } from "./options";
import { resolveOverlaps } from "./overlap";
import { findLiteralMatches } from "./literal";
import {
  createPseudonymBook,
  replacementFor,
  REDACTED,
  type PseudonymBook,
} from "./pseudonym";

export { REDACTED };

/**
 * Where a match's offsets are measured. A scanned-looking PDF page is now read
 * from its text layer *and* by OCR, and those are two independent coordinate
 * spaces — without this discriminator, offset 120 in the text layer and offset
 * 120 in the OCR output would produce the same id and the user excluding one
 * would silently un-redact the other.
 */
export type MatchSource = "text" | "ocr";

// Identifies a specific match occurrence so a user can remove one instance
// from the results list without affecting identical text found elsewhere.
// `page` distinguishes PDF pages, whose start/end offsets are page-local
// text positions and would otherwise collide across pages.
export function matchId(
  match: Pick<PIIMatch, "category" | "start" | "end">,
  page?: number,
  source: MatchSource = "text"
): string {
  return `${page ?? "t"}:${source}:${match.category}:${match.start}:${match.end}`;
}

export function findAllMatches(
  text: string,
  options?: RedactionOptions,
  manualSpans?: readonly ManualSpan[],
  page = 0
): PIIMatch[] {
  const opts = options ?? defaultRedactionOptions();
  const allMatches: PIIMatch[] = [];

  // User-marked spans first. They carry the highest priority in the registry,
  // so `resolveOverlaps` lets them win any conflict with a detector.
  if (manualSpans?.length) {
    allMatches.push(...resolveManualSpans(text, manualSpans, page).matches);
  }

  for (const category of ALL_CATEGORIES) {
    const opt = opts[category];
    if (!opt?.enabled) continue;
    // `manual` has no detector; its matches come from the block above.
    if (CATEGORY_DEFS[category].userAuthored) continue;

    if (opt.exactValue.trim()) {
      const values = opt.exactValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      for (const value of values) {
        allMatches.push(...findLiteralMatches(text, value, category));
      }
    } else {
      allMatches.push(...CATEGORY_DEFS[category].detect(text));
    }
  }

  return resolveOverlaps(allMatches, text);
}

export function emptySummary(): RedactionSummary {
  const counts = {} as Record<PIICategory, number>;
  for (const category of ALL_CATEGORIES) counts[category] = 0;
  return { counts, total: 0, items: [] };
}

export interface SummarizeContext {
  page?: number;
  source?: MatchSource;
  mode?: ReplacementMode;
  /**
   * Occurrences the user chose to keep. They are still listed (so the review
   * screen can show them and let the user change their mind) but are flagged
   * and left out of the counts.
   */
  excludedIds?: ReadonlySet<string>;
  /**
   * Document-scoped, so the same value gets the same token across PDF pages.
   * Omit for a one-shot summary; pass one from `createRedactionContext` when the
   * caller processes a document in parts.
   */
  book?: PseudonymBook;
}

export function summarize(
  matches: PIIMatch[],
  context: SummarizeContext = {}
): RedactionSummary {
  const {
    page,
    source = "text",
    mode = "redacted",
    book = createPseudonymBook(),
    excludedIds,
  } = context;

  const summary = emptySummary();
  for (const match of matches) {
    const id = matchId(match, page, source);
    const kept = excludedIds?.has(id) ?? false;

    if (!kept) {
      summary.counts[match.category] += 1;
      summary.total += 1;
    }

    summary.items.push({
      id,
      category: match.category,
      text: match.text,
      start: match.start,
      end: match.end,
      replacement: replacementFor(match, mode, book),
      ...(kept ? { kept: true } : {}),
    });
  }
  return summary;
}

// Drops matches the user has removed from the results list (identified by
// matchId) so they're excluded from both the summary and the redacted
// output, effectively "un-redacting" that occurrence.
export function excludeMatches(
  matches: PIIMatch[],
  excludedIds?: ReadonlySet<string>,
  page?: number,
  source: MatchSource = "text"
): PIIMatch[] {
  if (!excludedIds || excludedIds.size === 0) return matches;
  return matches.filter((match) => !excludedIds.has(matchId(match, page, source)));
}

export function mergeSummaries(summaries: RedactionSummary[]): RedactionSummary {
  const merged = emptySummary();
  for (const summary of summaries) {
    // Iterate the registry, not the incoming object's own keys — a summary
    // that arrived from an older worker build could be missing one.
    for (const category of ALL_CATEGORIES) {
      merged.counts[category] += summary.counts[category] ?? 0;
    }
    merged.total += summary.total;
    merged.items.push(...summary.items);
  }
  return merged;
}

export function redactText(
  text: string,
  options?: RedactionOptions,
  excludedIds?: ReadonlySet<string>,
  mode: ReplacementMode = "redacted",
  manualSpans?: readonly ManualSpan[]
): RedactionResult {
  const all = findAllMatches(text, options, manualSpans);

  // Tokens are assigned over *all* matches, before exclusions. Excluding an item
  // then leaves a gap in the numbering rather than renumbering everything after
  // it — otherwise un-redacting one value would silently change every other
  // token in the document.
  const book = createPseudonymBook();
  book.register(all);

  const kept = excludeMatches(all, excludedIds);
  // Summarised over *all* matches so kept occurrences stay visible and
  // clickable on the review screen; only `kept` drives what is written out.
  const summary = summarize(all, { mode, book, excludedIds });

  // The renderer reads the replacement the summary recorded rather than
  // recomputing it, so what the panel shows is by construction what the file
  // contains.
  const replacements = new Map(summary.items.map((item) => [item.id, item.replacement]));

  let redactedText = "";
  let cursor = 0;

  for (const match of kept) {
    const replacement = replacements.get(matchId(match)) ?? REDACTED;
    redactedText += text.slice(cursor, match.start) + replacement;
    cursor = match.end;
  }
  redactedText += text.slice(cursor);

  return { redactedText, summary, matches: kept };
}

/**
 * A document-scoped context for callers that summarise in parts (the PDF path
 * runs detection page by page). Holding one book across those calls is what
 * makes a pseudonym mean the same thing on page 1 and page 9.
 */
export function createRedactionContext(mode: ReplacementMode = "redacted") {
  const book = createPseudonymBook();
  return {
    book,
    mode,
    /** Assign tokens for a page's matches before exclusions are applied. */
    register(matches: readonly PIIMatch[]) {
      book.register(matches);
    },
    summarize(matches: PIIMatch[], page?: number, source: MatchSource = "text") {
      return summarize(matches, { page, source, mode, book });
    },
  };
}
