import type { PIICategory, PIIMatch } from "../../types";
import {
  findEmails,
  findPhones,
  findCreditCards,
  findAccountNumbers,
  findSSNs,
  findDates,
  findAges,
} from "./patterns";
import {
  findIpAddresses,
  findIbans,
  findMacAddresses,
  findUrls,
  findSecrets,
  findNationalIds,
  findRoutingNumbers,
  findPassports,
  findDriversLicences,
  findPostalCodes,
} from "./identifiers";
import { findPeople, findPlaces } from "./nlp";

// Single source of truth for everything a PII category is and does.
//
// This used to be spread across six declarations (ALL_CATEGORIES,
// defaultRedactionOptions, DETECTORS, CATEGORY_PRIORITY, emptySummary's
// hand-written counts object, and CATEGORY_META/CATEGORY_ORDER), so adding a
// category meant touching seven files and two of those lists would not fail
// loudly if you missed them. Because this is a `Record<PIICategory, ...>`,
// omitting an entry is now a compile error — and that works without needing
// `strict: true`, which this project does not currently set.
//
// Adding a category is three lines: the union member in src/types/index.ts, an
// entry here, and an icon in categoryMeta.ts.

/**
 * How a user-typed value in a category's "only these values" list is matched.
 * `digits` reduces the value to its digits and tolerates formatting
 * differences, so typing 0543990303 also finds 054-399-0303.
 */
export type LiteralMode = "literal" | "digits";

/**
 * Categories are grouped for the configure UI. With this many categories a
 * flat list is unusable, and highlight colours are assigned per group rather
 * than per category (18 distinguishable, accessible hues do not exist).
 */
export type CategoryGroup =
  | "contact"
  | "financial"
  | "identifier"
  | "location"
  | "other";

export interface CategoryDefinition {
  /**
   * Lower wins when two matches overlap. Must be unique (asserted in tests).
   * Regex categories rank above NLP guesses so a precise, format-driven match
   * beats compromise tagging part of an email as a place.
   */
  priority: number;
  /** Pure, DOM-free detector. Must be safe to run inside a Web Worker. */
  detect: (text: string) => PIIMatch[];
  /** Used by the `label` replacement mode: "EMAIL" renders as [EMAIL]. */
  label: string;
  /** Used by the `pseudonym` mode: "PERSON" renders as [PERSON_1]. */
  pseudonymPrefix: string;
  singular: string;
  plural: string;
  defaultEnabled: boolean;
  group: CategoryGroup;
  literalMode: LiteralMode;
  /**
   * False for user-authored categories: an allowlist entry must never be able
   * to suppress something the user explicitly asked to redact.
   */
  suppressible: boolean;
  /**
   * Normalises a matched value so two spellings of the same thing collapse to
   * one pseudonym token. Digits-only for numbers, so "054-399-0303" and
   * "0543990303" are recognised as the same phone.
   */
  pseudonymKey: (text: string) => string;
  /**
   * True for categories the user creates rather than the app detects. These are
   * hidden from the configure screen (there is nothing to switch on) and always
   * outrank detected matches.
   */
  userAuthored?: boolean;
}

/** Case- and whitespace-insensitive: "John  Doe" == "john doe". */
const textKey = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

/** For numeric values, formatting is noise. */
const digitsKey = (text: string): string => text.replace(/\D/g, "");

// Declaration order is the display order, replacing CATEGORY_ORDER.
export const CATEGORY_DEFS: Record<PIICategory, CategoryDefinition> = {
  // Outranks everything: if the user explicitly marked a span, no detector's
  // opinion about that text should override it.
  manual: {
    priority: -10,
    detect: () => [],
    label: "REDACTED",
    pseudonymPrefix: "REDACTED",
    singular: "Marked by you",
    plural: "Marked by you",
    defaultEnabled: true,
    group: "other",
    literalMode: "literal",
    suppressible: false,
    userAuthored: true,
    pseudonymKey: textKey,
  },
  email: {
    priority: 1,
    detect: findEmails,
    label: "EMAIL",
    pseudonymPrefix: "EMAIL",
    singular: "Email address",
    plural: "Email addresses",
    defaultEnabled: true,
    group: "contact",
    literalMode: "literal",
    suppressible: true,
    // Local-part case is technically significant per RFC 5321 but practically
    // never is, and treating Jane@x.com and jane@x.com as two different people
    // would be the more surprising outcome.
    pseudonymKey: (text) => text.trim().toLowerCase(),
  },
  // Above IBAN and creditCard so a card-shaped path segment can't split a URL
  // into two half-redacted pieces.
  url: {
    priority: 2,
    detect: findUrls,
    label: "URL",
    pseudonymPrefix: "URL",
    singular: "Web address",
    plural: "Web addresses",
    defaultEnabled: false,
    group: "contact",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.trim().toLowerCase().replace(/\/+$/, ""),
  },
  // Prefix- and keyword-gated, so it is very specific and outranks everything.
  secret: {
    priority: 0,
    detect: findSecrets,
    label: "SECRET",
    pseudonymPrefix: "SECRET",
    singular: "API key or credential",
    plural: "API keys and credentials",
    defaultEnabled: true,
    group: "identifier",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.trim(),
  },
  iban: {
    priority: 3,
    detect: findIbans,
    label: "IBAN",
    pseudonymPrefix: "IBAN",
    singular: "Bank account (IBAN)",
    plural: "Bank accounts (IBAN)",
    defaultEnabled: true,
    group: "financial",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
  },
  ssn: {
    priority: 5,
    detect: findSSNs,
    label: "SSN",
    pseudonymPrefix: "SSN",
    singular: "Social Security Number",
    plural: "Social Security Numbers",
    defaultEnabled: true,
    group: "identifier",
    literalMode: "digits",
    suppressible: true,
    pseudonymKey: digitsKey,
  },
  creditCard: {
    priority: 4,
    detect: findCreditCards,
    label: "CARD",
    pseudonymPrefix: "CARD",
    singular: "Credit card number",
    plural: "Credit card numbers",
    defaultEnabled: true,
    group: "financial",
    literalMode: "digits",
    suppressible: true,
    pseudonymKey: digitsKey,
  },
  // Ranked above `phone` deliberately. A dot-separated date like 01.01.1990
  // also satisfies the (very permissive) phone pattern, and when phone won the
  // tie the value was reported as a phone number — which meant unticking
  // "Dates" did not actually stop dates being redacted, and unticking "Phone
  // numbers" could expose them.
  date: {
    priority: 10,
    detect: findDates,
    label: "DATE",
    pseudonymPrefix: "DATE",
    singular: "Date",
    plural: "Dates",
    defaultEnabled: true,
    group: "other",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: textKey,
  },
  phone: {
    priority: 13,
    detect: findPhones,
    label: "PHONE",
    pseudonymPrefix: "PHONE",
    singular: "Phone number",
    plural: "Phone numbers",
    defaultEnabled: true,
    group: "contact",
    literalMode: "digits",
    suppressible: true,
    pseudonymKey: digitsKey,
  },
  nationalId: {
    // Below routingNumber: this detector accepts any 9-digit run that passes a
    // check digit, whereas routingNumber additionally requires the text to say
    // "routing". Explicit textual evidence should win the label.
    priority: 7,
    detect: findNationalIds,
    label: "ID",
    pseudonymPrefix: "ID",
    singular: "National ID number",
    plural: "National ID numbers",
    defaultEnabled: true,
    group: "identifier",
    literalMode: "digits",
    suppressible: true,
    pseudonymKey: digitsKey,
  },
  routingNumber: {
    priority: 6,
    detect: findRoutingNumbers,
    label: "ROUTING",
    pseudonymPrefix: "ROUTING",
    singular: "Bank routing number",
    plural: "Bank routing numbers",
    defaultEnabled: true,
    group: "financial",
    literalMode: "digits",
    suppressible: true,
    pseudonymKey: digitsKey,
  },
  // Above ipAddress: six colon-separated hex pairs is the stricter shape of the
  // two, so it should win when both could match.
  macAddress: {
    priority: 8,
    detect: findMacAddresses,
    label: "MAC",
    pseudonymPrefix: "MAC",
    singular: "MAC address",
    plural: "MAC addresses",
    defaultEnabled: true,
    group: "identifier",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
  },
  // Must outrank phone: "192.168.1.254" also satisfies the phone pattern.
  ipAddress: {
    priority: 9,
    detect: findIpAddresses,
    label: "IP",
    pseudonymPrefix: "IP",
    singular: "IP address",
    plural: "IP addresses",
    defaultEnabled: true,
    group: "identifier",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.trim().toLowerCase(),
  },
  passport: {
    priority: 11,
    detect: findPassports,
    label: "PASSPORT",
    pseudonymPrefix: "PASSPORT",
    singular: "Passport number",
    plural: "Passport numbers",
    defaultEnabled: true,
    group: "identifier",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.trim().toUpperCase(),
  },
  driversLicence: {
    priority: 12,
    detect: findDriversLicences,
    label: "LICENCE",
    pseudonymPrefix: "LICENCE",
    singular: "Driving licence number",
    plural: "Driving licence numbers",
    defaultEnabled: true,
    group: "identifier",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.trim().toUpperCase(),
  },
  // Default-off: even the specific forms shipped here fire on ordinary
  // reference codes often enough that most users would not want it on by
  // default, and a postcode alone is weak identification.
  postalCode: {
    priority: 15,
    detect: findPostalCodes,
    label: "POSTCODE",
    pseudonymPrefix: "POSTCODE",
    singular: "Postal code",
    plural: "Postal codes",
    defaultEnabled: false,
    group: "location",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: (text) => text.trim().toUpperCase().replace(/\s+/g, ""),
  },
  // Ranked below creditCard/ssn/phone on purpose: it is the catch-all that
  // guarantees a long digit run is never left in the clear when a checksum
  // fails, but those categories should win the label whenever they validate.
  accountNumber: {
    priority: 14,
    detect: findAccountNumbers,
    label: "NUMBER",
    pseudonymPrefix: "NUMBER",
    singular: "Long number (account, reference)",
    plural: "Long numbers (account, reference)",
    defaultEnabled: true,
    group: "financial",
    literalMode: "digits",
    suppressible: true,
    pseudonymKey: digitsKey,
  },
  age: {
    priority: 16,
    detect: findAges,
    label: "AGE",
    pseudonymPrefix: "AGE",
    singular: "Age",
    plural: "Ages",
    defaultEnabled: true,
    group: "other",
    literalMode: "digits",
    suppressible: true,
    pseudonymKey: digitsKey,
  },
  person: {
    priority: 17,
    detect: findPeople,
    label: "NAME",
    pseudonymPrefix: "PERSON",
    singular: "Name",
    plural: "Names",
    defaultEnabled: true,
    group: "other",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: textKey,
  },
  place: {
    priority: 18,
    detect: findPlaces,
    label: "ADDRESS",
    pseudonymPrefix: "PLACE",
    singular: "Address",
    plural: "Addresses",
    defaultEnabled: true,
    group: "location",
    literalMode: "literal",
    suppressible: true,
    pseudonymKey: textKey,
  },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_DEFS) as PIICategory[];

/** Group display order and labels for the configure screen. */
export const GROUP_ORDER: CategoryGroup[] = [
  "contact",
  "financial",
  "identifier",
  "location",
  "other",
];

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  contact: "Contact details",
  financial: "Financial",
  identifier: "Identifiers",
  location: "Location",
  other: "Names & other details",
};

/** Categories a user can switch on or off. Excludes user-authored ones. */
export const CONFIGURABLE_CATEGORIES = ALL_CATEGORIES.filter(
  (category) => !CATEGORY_DEFS[category].userAuthored
);

export function categoriesInGroup(group: CategoryGroup): PIICategory[] {
  return CONFIGURABLE_CATEGORIES.filter(
    (category) => CATEGORY_DEFS[category].group === group
  );
}
