import type { PIICategory, PIIMatch } from "../../types";

interface MatchWithIndices extends RegExpMatchArray {
  indices?: Array<[number, number] | undefined>;
}

function matchesFor(
  regex: RegExp,
  text: string,
  category: PIICategory,
  isValid?: (match: RegExpMatchArray) => boolean
): PIIMatch[] {
  const matches: PIIMatch[] = [];
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue;
    if (isValid && !isValid(match)) continue;
    matches.push({
      category,
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return matches;
}

// Like matchesFor, but redacts only a capture group's span rather than the
// whole match — used when a detector needs surrounding context (e.g. "years
// old") to identify a match confidently, but should only redact the value
// itself. Requires the regex to carry the `d` (hasIndices) flag.
function groupMatchesFor(
  regex: RegExp,
  text: string,
  category: PIICategory,
  groupIndex: number
): PIIMatch[] {
  const matches: PIIMatch[] = [];
  for (const match of text.matchAll(regex)) {
    const indices = (match as MatchWithIndices).indices;
    const range = indices?.[groupIndex];
    if (!range) continue;
    const [start, end] = range;
    matches.push({ category, start, end, text: text.slice(start, end) });
  }
  return matches;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Deliberately permissive: an optional leading "+" country code, then 1-5
// digit groups (2-4 digits each) separated by spaces/dots/dashes or nothing
// at all, validated by overall digit count (7-15, the general international
// range). This catches both "(415) 555-2671"-style and "054-3990303"-style
// numbers, formatted or not.
const PHONE_CANDIDATE_RE = /\+?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){1,5}\b/g;

// 13-19 digits, optionally grouped by spaces or dashes (e.g. 4111 1111 1111 1111)
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

const MONTH_NAMES =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const DATE_NUMERIC_RE = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g;
const DATE_ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const DATE_MONTH_DAY_YEAR_RE = new RegExp(
  `\\b(?:${MONTH_NAMES})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`,
  "gi"
);
const DATE_DAY_MONTH_YEAR_RE = new RegExp(
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_NAMES})\\.?,?\\s+\\d{4}\\b`,
  "gi"
);

const AGE_YEARS_OLD_RE = /\b(\d{1,3})[\s-]?years?[\s-]?old\b/gid;
const AGE_YO_RE = /\b(\d{1,3})\s*y\.?o\.?\b/gid;
const AGE_LABEL_RE = /\bage[d]?[:\s]+(\d{1,3})\b/gid;

function luhnCheck(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function findEmails(text: string): PIIMatch[] {
  return matchesFor(EMAIL_RE, text, "email");
}

const ISO_DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function findPhones(text: string): PIIMatch[] {
  return matchesFor(PHONE_CANDIDATE_RE, text, "phone", (match) => {
    if (ISO_DATE_SHAPE_RE.test(match[0])) return false;
    const digits = match[0].replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  });
}

export function findCreditCards(text: string): PIIMatch[] {
  return matchesFor(CREDIT_CARD_RE, text, "creditCard", (match) => {
    const digits = match[0].replace(/[ -]/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
  });
}

export function findSSNs(text: string): PIIMatch[] {
  return matchesFor(SSN_RE, text, "ssn");
}

export function findDates(text: string): PIIMatch[] {
  return [
    ...matchesFor(DATE_ISO_RE, text, "date"),
    ...matchesFor(DATE_NUMERIC_RE, text, "date"),
    ...matchesFor(DATE_MONTH_DAY_YEAR_RE, text, "date"),
    ...matchesFor(DATE_DAY_MONTH_YEAR_RE, text, "date"),
  ];
}

export function findAges(text: string): PIIMatch[] {
  return [
    ...groupMatchesFor(AGE_YEARS_OLD_RE, text, "age", 1),
    ...groupMatchesFor(AGE_YO_RE, text, "age", 1),
    ...groupMatchesFor(AGE_LABEL_RE, text, "age", 1),
  ];
}
