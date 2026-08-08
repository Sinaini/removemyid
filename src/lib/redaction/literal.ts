import type { PIICategory, PIIMatch } from "../../types";
import { CATEGORY_DEFS } from "./registry";
import { maxDigitRun } from "./patterns";

// Matching user-typed values ("only redact this one name", "always redact this
// term"). This replaced three builders in redact.ts that between them produced
// the worst over-redaction and the worst partial-redaction bugs in the app.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

export interface LiteralOptions {
  caseSensitive?: boolean;
  /** Default true. Prevents "Al" from matching inside "Alabama". */
  wholeWord?: boolean;
}

/**
 * A literal search for `value`, tolerant of whitespace differences.
 *
 * Word boundaries use `(?<![\p{L}\p{N}_])` rather than `\b`, because `\b` is
 * ASCII-only and would place a boundary in the middle of Hebrew or accented
 * text — and Hebrew is a supported language here.
 *
 * The bug this fixes: the old name builder emitted every word of a multi-word
 * value as its own unanchored alternative, so a person value of "Al Green"
 * became /(?:Al\s+Green|Green\s+Al|Al|Green)/gi and turned "Alabama is green
 * with algae" into "[REDACTED]abama is [REDACTED] with [REDACTED]gae".
 *
 * Two behaviours were deliberately dropped rather than fixed:
 *  - Reverse word order ("St Main 123" for "123 Main St"). Nobody writes
 *    addresses backwards; it was pure false-positive surface.
 *  - Splitting a value into its individual words. That *is* the bug above. A
 *    user who wants a bare "John" redacted adds "John" as its own value, which
 *    is now trivial since values are a list rather than one comma-joined field.
 */
export function buildLiteralRegex(
  value: string,
  options: LiteralOptions = {}
): RegExp | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const { caseSensitive = false, wholeWord = true } = options;

  // Collapse internal whitespace to `\s+` so a value typed on one line still
  // matches text that wrapped across two.
  const body = trimmed
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");

  let source = body;
  if (wholeWord) {
    // Only guard an edge that is actually a word character — otherwise a value
    // like "(555)" would demand a non-word char before "(", which is wrong.
    if (WORD_CHAR.test(trimmed[0])) source = `(?<![\\p{L}\\p{N}_])${source}`;
    if (WORD_CHAR.test(trimmed[trimmed.length - 1])) {
      source = `${source}(?![\\p{L}\\p{N}_])`;
    }
  }

  const flags = caseSensitive ? "gu" : "giu";
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

const MIN_FLEXIBLE_DIGITS = 6;
const MAX_FLEXIBLE_DIGITS = 24;

/**
 * A formatting-tolerant search for a number the user typed: entering
 * 0543990303 should also find "054-399-0303" and "(054) 399 0303".
 *
 * Three fixes over the previous version:
 *  - The separator is a single optional character from an explicit class, not
 *    `[\s.-]*`. Zero-or-more whitespace meant typing "1234" matched
 *    "order 1 2 3 4 shipped", and because `\s` includes newlines it could
 *    stitch digits together across lines or CSV rows.
 *  - The minimum is 6 digits, not 4. Four digits matched page numbers, years
 *    and quantities.
 *  - The optional `\d{1,3}` country-code prefix is gone. Being greedy, it ate a
 *    neighbouring digit: typing "1234567" against "total 91234567" matched
 *    "91234567", starting mid-number and shifting every PDF box by a character.
 *    Country-code tolerance is expressed as separate, individually anchored
 *    alternatives instead.
 */
export function buildFlexibleDigitRegex(value: string): RegExp | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < MIN_FLEXIBLE_DIGITS || digits.length > MAX_FLEXIBLE_DIGITS) {
    return null;
  }

  const spaced = (run: string) => run.split("").join("[ .()\\-\\u00A0]?");

  const alternatives = new Set<string>();
  alternatives.add(spaced(digits));

  // An international form of the same number: "+972 54 399 0303" for a value
  // typed as "0543990303", and vice versa.
  if (digits.length >= 10) {
    const national = digits.slice(-9);
    alternatives.add(`\\+?\\d{1,3}[ .\\-]?${spaced(national)}`);
  }
  if (digits.length <= 10) {
    alternatives.add(`\\+?\\d{1,3}[ .\\-]?${spaced(digits)}`);
  }

  // Every alternative is independently anchored, so no branch can begin or end
  // in the middle of a longer digit run.
  const source = [...alternatives].map((alt) => `(?<!\\d)${alt}(?!\\d)`).join("|");

  try {
    return new RegExp(`(?:${source})`, "gi");
  } catch {
    return null;
  }
}

/** A grouped number needs at least one pair of adjacent digits to be plausible. */
export function isPlausibleGroupedNumber(text: string): boolean {
  return maxDigitRun(text) >= 2;
}

/**
 * All occurrences of one user-supplied value, attributed to `category`.
 * The matching style comes from the category's `literalMode`, so a phone
 * number is matched digit-flexibly while a name is matched literally.
 */
export function findLiteralMatches(
  text: string,
  value: string,
  category: PIICategory,
  options: LiteralOptions = {}
): PIIMatch[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const mode = CATEGORY_DEFS[category]?.literalMode ?? "literal";
  const digitsOnly = mode === "digits" && /\d/.test(trimmed) && !/[\p{L}]/u.test(trimmed);

  const regex = digitsOnly
    ? buildFlexibleDigitRegex(trimmed)
    : buildLiteralRegex(trimmed, options);
  if (!regex) return [];

  const matches: PIIMatch[] = [];
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue;
    if (digitsOnly && !isPlausibleGroupedNumber(match[0])) continue;
    matches.push({
      category,
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return matches;
}
