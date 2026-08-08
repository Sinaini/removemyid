import type {
  PIICategory,
  PIIMatch,
  RedactionOptions,
  RedactionResult,
  RedactionSummary,
} from "../../types";
import { ALL_CATEGORIES, CATEGORY_DEFS } from "./registry";
import { defaultRedactionOptions } from "./options";
import { resolveOverlaps } from "./overlap";
import { findLiteralMatches } from "./literal";

export const REDACTED = "[REDACTED]";

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
  options?: RedactionOptions
): PIIMatch[] {
  const opts = options ?? defaultRedactionOptions();
  const allMatches: PIIMatch[] = [];

  for (const category of ALL_CATEGORIES) {
    const opt = opts[category];
    if (!opt?.enabled) continue;

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

export function summarize(
  matches: PIIMatch[],
  page?: number,
  source: MatchSource = "text"
): RedactionSummary {
  const summary = emptySummary();
  for (const match of matches) {
    summary.counts[match.category] += 1;
    summary.total += 1;
    summary.items.push({
      id: matchId(match, page, source),
      category: match.category,
      text: match.text,
      start: match.start,
      end: match.end,
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
  excludedIds?: ReadonlySet<string>
): RedactionResult {
  const kept = excludeMatches(findAllMatches(text, options), excludedIds);

  let redactedText = "";
  let cursor = 0;

  for (const match of kept) {
    redactedText += text.slice(cursor, match.start) + REDACTED;
    cursor = match.end;
  }
  redactedText += text.slice(cursor);

  return { redactedText, summary: summarize(kept), matches: kept };
}
