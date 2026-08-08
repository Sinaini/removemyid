import type { PIICategory, PIIMatch } from "../../types";
import { execAll } from "./scan";

// Additional identifier detectors, kept separate from patterns.ts so the
// original six stay easy to read.
//
// The governing rule for everything here: a pattern with a checksum can afford
// to be permissive, because the checksum does the filtering. A pattern without
// one must be anchored to surrounding context, or it eats the document. Where
// neither is possible the category ships default-off, or not at all — the plan
// deliberately dropped bare ABA routing numbers, bare 5-digit ZIPs, per-state
// driving licence formats and entropy-based secret detection for exactly this
// reason.

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

/** Redacts only a capture group, so a keyword gate isn't blacked out too. */
function groupMatchesFor(
  regex: RegExp,
  text: string,
  category: PIICategory,
  groupIndex: number
): PIIMatch[] {
  const matches: PIIMatch[] = [];
  execAll(regex, text, (match) => {
    const indices = (match as RegExpExecArray & {
      indices?: Array<[number, number] | undefined>;
    }).indices;
    const range = indices?.[groupIndex];
    if (!range) return false;
    const [start, end] = range;
    matches.push({ category, start, end, text: text.slice(start, end) });
    return true;
  });
  return matches;
}

// ---------------------------------------------------------------- IP address

const IPV4_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

// Fully enumerated per RFC 4291 rather than assembled from nested quantifiers.
// Longer to read, but it has no catastrophic-backtracking risk, and it rejects
// "10:30:45" for free — a timestamp is three groups with no "::", which none of
// these alternatives accepts.
const H = "[0-9A-Fa-f]{1,4}";
const IPV6_RE = new RegExp(
  "(?<![0-9A-Fa-f:])(?:" +
    [
      `(?:${H}:){7}${H}`,
      `(?:${H}:){1,7}:`,
      `(?:${H}:){1,6}:${H}`,
      `(?:${H}:){1,5}(?::${H}){1,2}`,
      `(?:${H}:){1,4}(?::${H}){1,3}`,
      `(?:${H}:){1,3}(?::${H}){1,4}`,
      `(?:${H}:){1,2}(?::${H}){1,5}`,
      `${H}:(?::${H}){1,6}`,
      `:(?::${H}){1,7}`,
      "::",
    ].join("|") +
    ")(?![0-9A-Fa-f:])",
  "g"
);

export function findIpAddresses(text: string): PIIMatch[] {
  return [
    ...matchesFor(IPV4_RE, text, "ipAddress"),
    // A bare "::" is the unspecified address, not anyone's PII.
    ...matchesFor(IPV6_RE, text, "ipAddress", (match) => match[0] !== "::"),
  ];
}

// ---------------------------------------------------------------------- IBAN

const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g;

/**
 * ISO 13616 mod-97: move the first four characters to the end, replace letters
 * with their position + 9, and check the remainder is 1. Computed digit by digit
 * because the integer is far larger than Number.MAX_SAFE_INTEGER.
 */
export function ibanMod97(value: string): boolean {
  const compact = value.replace(/\s/g, "").toUpperCase();
  if (compact.length < 15 || compact.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;

  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;

  for (const char of rearranged) {
    const chunk = /\d/.test(char)
      ? char
      : String(char.charCodeAt(0) - 55); // 'A' -> 10
    for (const digit of chunk) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

export function findIbans(text: string): PIIMatch[] {
  return matchesFor(IBAN_RE, text, "iban", (match) => ibanMod97(match[0]));
}

// --------------------------------------------------------------- MAC address

// The backreference forces one consistent separator, so "00:1B:44-11:3A:B7"
// isn't matched.
const MAC_RE = /\b[0-9A-Fa-f]{2}(?:([:-])[0-9A-Fa-f]{2})(?:\1[0-9A-Fa-f]{2}){4}\b/g;

export function findMacAddresses(text: string): PIIMatch[] {
  return matchesFor(MAC_RE, text, "macAddress");
}

// ----------------------------------------------------------------------- URL

// Scheme-ful or www-prefixed only. Bare domains are deliberately not matched:
// "example.com" is indistinguishable from a filename or an abbreviation, and
// matching them turns every "etc.gov" style token into a redaction. The trailing
// character class strips punctuation that ends a sentence rather than the URL.
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"'“”‘’]+[^\s<>()[\]{}"'“”‘’.,;:!?]/g;

export function findUrls(text: string): PIIMatch[] {
  return matchesFor(URL_RE, text, "url");
}

// ------------------------------------------------------------------- Secrets

// Prefix- and keyword-gated only. Entropy-based detection is deliberately
// absent: its false-positive rate on hashes, UUIDs, base64 blobs and minified
// code is untunable without a corpus we cannot collect without violating the
// premise of this tool.
const SECRET_PATTERNS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ABIA|ACCA)[A-Z0-9]{16}\b/g, // AWS
  /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, // GitHub
  /\bxox[abpsr]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, // Stripe
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g, // OpenAI / Anthropic style
];

// Lazy and anchored at both ends, so it is linear; an unterminated BEGIN scans
// to end-of-input exactly once.
const PRIVATE_KEY_RE =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const CREDENTIAL_RE =
  /\b(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|bearer|client[_-]?secret|password|passwd|pwd)\b\W{0,6}["']?([A-Za-z0-9_\-./+=]{12,})/gid;

export function findSecrets(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];
  for (const pattern of SECRET_PATTERNS) {
    matches.push(...matchesFor(pattern, text, "secret"));
  }
  matches.push(...matchesFor(PRIVATE_KEY_RE, text, "secret"));
  matches.push(...groupMatchesFor(CREDENTIAL_RE, text, "secret", 1));
  return matches;
}

// --------------------------------------------------------------- National ID

const IL_ID_RE = /(?<!\d)\d{9}(?!\d)/g;

/**
 * Israeli teudat zehut check digit: alternating weights of 1 and 2, digits of
 * any two-digit product summed, total divisible by 10.
 */
export function israeliIdCheck(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const product = Number(digits[i]) * ((i % 2) + 1);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

export function findNationalIds(text: string): PIIMatch[] {
  // A false positive here costs a mislabel, not a leak: any 9-digit run is
  // covered by phone or accountNumber regardless.
  return matchesFor(IL_ID_RE, text, "nationalId", (match) => israeliIdCheck(match[0]));
}

// ------------------------------------------------------- Routing / passport /
// ------------------------------------------------------- licence / postcode

/** ABA routing check: weights 3, 7, 1 repeating; the total must be divisible by 10. */
export function abaCheck(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return false;

  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * weights[i];
  return sum % 10 === 0;
}

// Context-gated only. The bare form would accept one in ten of all nine-digit
// numbers, and accountNumber already guarantees those are covered.
const ABA_LABELLED_RE = /\b(?:aba|routing|rtn)\b\W{0,20}((?<!\d)\d{9}(?!\d))/gid;

export function findRoutingNumbers(text: string): PIIMatch[] {
  return groupMatchesFor(ABA_LABELLED_RE, text, "routingNumber", 1).filter((m) =>
    abaCheck(m.text)
  );
}

// No universal checksum exists for passport numbers, so an ungated
// [A-Z0-9]{6,9} would match most words in a document. Only the labelled form and
// the ICAO machine-readable zone are safe to ship.
const PASSPORT_RE =
  /\b(?:passport(?:\s*(?:no|number|nr|#))?|דרכון)\b\W{0,12}([A-Z0-9]{6,9})\b/gid;
const MRZ_LINE_RE = /^[A-Z0-9<]{9}\d[A-Z]{3}\d{6}\d[MF<]\d{6}\d[A-Z0-9<]{14}\d\d$/gm;

export function findPassports(text: string): PIIMatch[] {
  return [
    ...groupMatchesFor(PASSPORT_RE, text, "passport", 1),
    ...matchesFor(MRZ_LINE_RE, text, "passport"),
  ];
}

const DL_RE =
  /\b(?:driver'?s?\s*(?:licen[cs]e|lic|dl)|licen[cs]e\s*(?:no|number|#)|רישיון\s*נהיגה)\b\W{0,12}([A-Z0-9][A-Z0-9-]{4,14})\b/gid;

export function findDriversLicences(text: string): PIIMatch[] {
  return groupMatchesFor(DL_RE, text, "driversLicence", 1);
}

// Bare 5-digit US and 7-digit Israeli postcodes are deliberately absent: they
// collide with every quantity, year and reference number in existence and would
// make the tool unusable on a spreadsheet. These four forms are specific enough
// to be safe, and the category still ships default-off.
const ZIP4_RE = /(?<!\d)\d{5}-\d{4}(?!\d)/g;
const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;
const CA_POSTCODE_RE = /\b[ABCEGHJ-NPRSTVXY]\d[A-Z]\s?\d[A-Z]\d\b/gi;
const POSTCODE_LABELLED_RE =
  /\b(?:zip(?:\s*code)?|postal\s*code|postcode|מיקוד)\b\W{0,10}(\d{5,7}(?:-\d{4})?)\b/gid;

export function findPostalCodes(text: string): PIIMatch[] {
  return [
    ...matchesFor(ZIP4_RE, text, "postalCode"),
    ...matchesFor(UK_POSTCODE_RE, text, "postalCode"),
    ...matchesFor(CA_POSTCODE_RE, text, "postalCode"),
    ...groupMatchesFor(POSTCODE_LABELLED_RE, text, "postalCode", 1),
  ];
}
