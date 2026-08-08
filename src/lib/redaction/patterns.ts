import type { PIICategory, PIIMatch } from "../../types";

interface MatchWithIndices extends RegExpMatchArray {
  indices?: Array<[number, number] | undefined>;
}

/**
 * Scan `text` with `regex`, letting the caller accept or reject each candidate.
 *
 * The important detail is what happens on rejection. `String.prototype.matchAll`
 * always advances past the whole candidate, so a validator that says "no" makes
 * the scanner skip that text entirely and never consider a shorter match inside
 * it. That produced a verified leak: in "Card 4111111111111112", the credit-card
 * pattern matched all 16 digits and rejected them on Luhn, the phone pattern
 * matched the same run and rejected it for being longer than 15 digits, and the
 * number was written to the output completely unredacted.
 *
 * Retrying one character to the right instead means a rejected candidate can
 * never swallow the text around it. Cost is O(n·k) with k the maximum candidate
 * length (~40 characters for every pattern here), which is bounded and fine.
 */
function execAll(
  regex: RegExp,
  text: string,
  onMatch: (match: RegExpExecArray) => boolean
): void {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const scanner = new RegExp(regex.source, flags);

  let match: RegExpExecArray | null;
  while ((match = scanner.exec(text)) !== null) {
    const accepted = onMatch(match);
    scanner.lastIndex = accepted
      ? match.index + match[0].length
      : match.index + 1;
    // A zero-length match would otherwise spin forever.
    if (match[0].length === 0) scanner.lastIndex = match.index + 1;
  }
}

function matchesFor(
  regex: RegExp,
  text: string,
  category: PIICategory,
  isValid?: (match: RegExpExecArray) => boolean
): PIIMatch[] {
  const matches: PIIMatch[] = [];
  execAll(regex, text, (match) => {
    if (isValid && !isValid(match)) return false;
    matches.push({
      category,
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
    return true;
  });
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
  groupIndex: number,
  isValid?: (match: RegExpExecArray) => boolean
): PIIMatch[] {
  const matches: PIIMatch[] = [];
  execAll(regex, text, (match) => {
    if (isValid && !isValid(match)) return false;
    const indices = (match as MatchWithIndices).indices;
    const range = indices?.[groupIndex];
    if (!range) return false;
    const [start, end] = range;
    matches.push({ category, start, end, text: text.slice(start, end) });
    return true;
  });
  return matches;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Deliberately permissive: an optional leading "+" country code, then 1-5
// digit groups (2-4 digits each), validated by overall digit count (7-15, the
// general international range).
//
// Two guards matter here. The lookbehind and lookahead exclude any letter or
// digit, not just a digit: "ID AB1234567890" used to match "1234567890" and
// render as "ID AB[REDACTED]". A plain `\b` cannot express this (there is no
// word boundary between "B" and "1"), and a digit-only lookbehind doesn't help
// either, because the character actually preceding the run is a letter.
//
// The separator class is explicit rather than `\s` so a newline can never join
// digits from different lines (or different CSV rows) into one "phone number".
// Exactly one separator character is allowed between groups, with optional
// parens around each group — enough for "+1 (415) 555-2671" to match in full,
// while "12  34" (two spaces, i.e. adjacent table columns) is left alone.
const PHONE_CANDIDATE_RE =
  /(?<![\p{L}\p{N}])\+?\(?\d{1,4}\)?(?:[ .\-\u00A0]?\(?\d{2,4}\)?){1,5}(?![\p{L}\p{N}])/gu;

// 13-19 digits, optionally grouped by spaces or dashes (e.g. 4111 1111 1111 1111).
// The separator sits strictly *between* digits: the previous form,
// `(?:\d[ -]?){13,19}`, allowed a trailing one, so "Card 4111 1111 1111 1111 exp"
// matched with the trailing space included and rendered as "Card [REDACTED]exp"
// — and in the PDF path the black box was a space too wide.
const CREDIT_CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;

// Area 000/666/900-999, group 00, and serial 0000 are never issued, so
// rejecting them removes a large class of false positives on placeholder and
// test data. The backreference forces a consistent separator, so "123-45 6789"
// is not treated as an SSN.
const SSN_RE = /(?<!\d)(?!000|666|9\d\d)\d{3}([ -])(?!00)\d{2}\1(?!0000)\d{4}(?!\d)/g;

// A bare 9-digit run is genuinely ambiguous (national ID, account number,
// order number), so it is only read as an SSN when the surrounding text says
// so. The unlabelled case is still covered — see findAccountNumbers.
const SSN_LABELLED_RE =
  /\b(?:ssn|social\s+security(?:\s+(?:no|number|#))?)\W{0,10}((?!000|666|9\d\d)\d{3}[ -]?(?!00)\d{2}[ -]?(?!0000)\d{4})\b/gid;

const MONTH_NAMES =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const DATE_NUMERIC_RE = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g;
const DATE_ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
// The year is optional: a clinical note saying "born January 5" or "admitted
// 5 March" is still a date of birth, and requiring a year missed all of them.
const DATE_MONTH_DAY_RE = new RegExp(
  `\\b(?:${MONTH_NAMES})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`,
  "gi"
);
const DATE_DAY_MONTH_RE = new RegExp(
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_NAMES})\\.?(?:,?\\s+\\d{4})?\\b`,
  "gi"
);

const AGE_YEARS_OLD_RE = /\b(\d{1,3})[\s-]?years?[\s-]?old\b/gid;
const AGE_YO_RE = /\b(\d{1,3})\s*y\.?o\.?\b/gid;
// "aged 7 days" and "age: 3 weeks" are durations, not ages — the old pattern
// captured the number anyway. `years` is deliberately absent from the
// exclusion list so "aged 42 years" still matches.
const AGE_LABEL_RE =
  /\bage[d]?[:\s]+(\d{1,3})\b(?!\s*(?:days?|weeks?|months?|hours?|minutes?|mins?|secs?|seconds?))/gid;

// Safety net for long digit runs nothing else claims: 9 or more digits,
// optionally grouped. Deliberately has no checksum, and sits *below*
// creditCard/ssn/phone in the priority order so those still win and label the
// value correctly when they validate. Its job is to guarantee that a 16-digit
// number failing Luhn, or a 20-digit run too long to be a phone, is still
// covered rather than silently passed through.
//
// The trade-off is real and intentional: it also matches long invoice,
// tracking and epoch-millisecond numbers. Over-redacting one of those is a
// far better failure than leaking a card number.
const LONG_NUMBER_RE = /(?<!\d)\d(?:[ -]?\d){8,}(?!\d)/g;

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

/** Longest consecutive run of digits, ignoring separators. */
export function maxDigitRun(text: string): number {
  let best = 0;
  let current = 0;
  for (const char of text) {
    if (char >= "0" && char <= "9") {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

export function findEmails(text: string): PIIMatch[] {
  return matchesFor(EMAIL_RE, text, "email");
}

const ISO_DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_DATE_SHAPE_RE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;

export function findPhones(text: string): PIIMatch[] {
  return matchesFor(PHONE_CANDIDATE_RE, text, "phone", (match) => {
    // Date-shaped candidates are rejected here as well as being outranked by
    // the `date` category, so the value is never *labelled* a phone number
    // even when the Dates category is switched off.
    if (ISO_DATE_SHAPE_RE.test(match[0])) return false;
    if (NUMERIC_DATE_SHAPE_RE.test(match[0])) return false;
    // "1 2 3 4 5 6 7" is a list, not a phone number.
    if (maxDigitRun(match[0]) < 2) return false;

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
  return [
    ...matchesFor(SSN_RE, text, "ssn"),
    ...groupMatchesFor(SSN_LABELLED_RE, text, "ssn", 1),
  ];
}

export function findDates(text: string): PIIMatch[] {
  return [
    ...matchesFor(DATE_ISO_RE, text, "date"),
    ...matchesFor(DATE_NUMERIC_RE, text, "date"),
    ...matchesFor(DATE_MONTH_DAY_RE, text, "date"),
    ...matchesFor(DATE_DAY_MONTH_RE, text, "date"),
  ];
}

export function findAges(text: string): PIIMatch[] {
  return [
    ...groupMatchesFor(AGE_YEARS_OLD_RE, text, "age", 1),
    ...groupMatchesFor(AGE_YO_RE, text, "age", 1),
    ...groupMatchesFor(AGE_LABEL_RE, text, "age", 1),
  ];
}

export function findAccountNumbers(text: string): PIIMatch[] {
  return matchesFor(LONG_NUMBER_RE, text, "accountNumber", (match) => {
    // An ISO date and a grouped date run are not account numbers, and unlike
    // the phone case these can reach 9+ digits with separators.
    if (ISO_DATE_SHAPE_RE.test(match[0])) return false;
    if (NUMERIC_DATE_SHAPE_RE.test(match[0])) return false;
    return match[0].replace(/\D/g, "").length >= 9;
  });
}
