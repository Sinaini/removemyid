import type {
  PIICategory,
  PIIMatch,
  RedactionOptions,
  RedactionResult,
  RedactionSummary,
} from "../../types";
import {
  findEmails,
  findPhones,
  findCreditCards,
  findSSNs,
  findDates,
  findAges,
} from "./patterns";
import { findPeople, findPlaces } from "./nlp";
import { ALL_CATEGORIES, defaultRedactionOptions } from "./options";

export const REDACTED = "[REDACTED]";

// Identifies a specific match occurrence so a user can remove one instance
// from the results list without affecting identical text found elsewhere.
// `page` distinguishes PDF pages, whose start/end offsets are page-local
// text positions and would otherwise collide across pages.
export function matchId(
  match: Pick<PIIMatch, "category" | "start" | "end">,
  page?: number
): string {
  return `${page ?? "t"}:${match.category}:${match.start}:${match.end}`;
}

const DETECTORS: Record<PIICategory, (text: string) => PIIMatch[]> = {
  email: findEmails,
  phone: findPhones,
  creditCard: findCreditCards,
  ssn: findSSNs,
  date: findDates,
  age: findAges,
  person: findPeople,
  place: findPlaces,
};

// Regex-based categories are precise, format-driven matches, so they take
// priority over NLP guesses when spans overlap (e.g. compromise tagging a
// digit run inside an email as a place).
const CATEGORY_PRIORITY: Record<PIICategory, number> = {
  email: 0,
  phone: 1,
  creditCard: 2,
  ssn: 3,
  date: 4,
  age: 5,
  person: 6,
  place: 7,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A phone number a user types into the exact-value field (e.g. "0543990303")
// rarely matches the file's formatting byte-for-byte (e.g. "054-3990303",
// "+972 54 399 0303"). Reduce the typed value to its digits and rebuild a
// pattern that tolerates any spaces/dots/dashes between them, plus an
// optional "+"/country-code prefix, so formatting differences don't matter.
function buildFlexiblePhoneRegex(value: string): RegExp | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;

  const spaced = digits.split("").join("[\\s.-]*");
  return new RegExp(`\\+?(?:\\d{1,3}[\\s.-]*)?${spaced}`, "gi");
}

// A multi-word value is often written in reverse order elsewhere in the same
// document — "123 Main St" vs. "St Main 123". When the typed value has more
// than one word, also match the words in reverse order so both forms get
// redacted.
function buildLiteralRegex(value: string): RegExp {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2) return new RegExp(escapeRegExp(value), "gi");

  const forward = words.map(escapeRegExp).join("\\s+");
  const reversed = [...words].reverse().map(escapeRegExp).join("\\s+");
  return new RegExp(`(?:${forward}|${reversed})`, "gi");
}

// Names specifically also get each individual word as its own alternative —
// typing "John Doe" should also catch a bare "John" or "Doe" elsewhere in
// the document, on top of "John Doe" and "Doe John".
function buildNameRegex(value: string): RegExp {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2) return new RegExp(escapeRegExp(value), "gi");

  const forward = words.map(escapeRegExp).join("\\s+");
  const reversed = [...words].reverse().map(escapeRegExp).join("\\s+");
  const alternatives = [forward, reversed, ...words.map(escapeRegExp)];
  return new RegExp(`(?:${alternatives.join("|")})`, "gi");
}

function findLiteralMatches(
  text: string,
  value: string,
  category: PIICategory
): PIIMatch[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const regex =
    category === "phone"
      ? buildFlexiblePhoneRegex(trimmed)
      : category === "person"
        ? buildNameRegex(trimmed)
        : buildLiteralRegex(trimmed);
  if (!regex) return [];

  const matches: PIIMatch[] = [];
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue;
    matches.push({
      category,
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return matches;
}

function dedupeOverlaps(matches: PIIMatch[]): PIIMatch[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) return lengthDiff;
    return CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
  });

  const kept: PIIMatch[] = [];
  let lastEnd = -1;

  for (const match of sorted) {
    if (match.start < lastEnd) continue;
    kept.push(match);
    lastEnd = match.end;
  }

  return kept;
}

export function findAllMatches(
  text: string,
  options?: RedactionOptions
): PIIMatch[] {
  const opts = options ?? defaultRedactionOptions();
  const allMatches: PIIMatch[] = [];

  for (const category of ALL_CATEGORIES) {
    const opt = opts[category];
    if (!opt.enabled) continue;

    if (opt.exactValue.trim()) {
      const values = opt.exactValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      for (const value of values) {
        allMatches.push(...findLiteralMatches(text, value, category));
      }
    } else {
      allMatches.push(...DETECTORS[category](text));
    }
  }

  return dedupeOverlaps(allMatches);
}

export function emptySummary(): RedactionSummary {
  return {
    counts: {
      email: 0,
      phone: 0,
      creditCard: 0,
      ssn: 0,
      person: 0,
      place: 0,
      date: 0,
      age: 0,
    },
    total: 0,
    items: [],
  };
}

export function summarize(matches: PIIMatch[], page?: number): RedactionSummary {
  const summary = emptySummary();
  for (const match of matches) {
    summary.counts[match.category] += 1;
    summary.total += 1;
    summary.items.push({
      id: matchId(match, page),
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
  page?: number
): PIIMatch[] {
  if (!excludedIds || excludedIds.size === 0) return matches;
  return matches.filter((match) => !excludedIds.has(matchId(match, page)));
}

export function mergeSummaries(summaries: RedactionSummary[]): RedactionSummary {
  const merged = emptySummary();
  for (const summary of summaries) {
    for (const category of Object.keys(merged.counts) as PIICategory[]) {
      merged.counts[category] += summary.counts[category];
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

  return { redactedText, summary: summarize(kept) };
}
