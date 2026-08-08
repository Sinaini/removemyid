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
}

/** Case- and whitespace-insensitive: "John  Doe" == "john doe". */
const textKey = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

/** For numeric values, formatting is noise. */
const digitsKey = (text: string): string => text.replace(/\D/g, "");

// Declaration order is the display order, replacing CATEGORY_ORDER.
export const CATEGORY_DEFS: Record<PIICategory, CategoryDefinition> = {
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

export function categoriesInGroup(group: CategoryGroup): PIICategory[] {
  return ALL_CATEGORIES.filter((category) => CATEGORY_DEFS[category].group === group);
}
