import type { PIICategory, PIIMatch, ReplacementMode } from "../../types";
import { CATEGORY_DEFS } from "./registry";

export const REDACTED = "[REDACTED]";

/**
 * Assigns stable tokens to values, so the same person is `[PERSON_1]` everywhere
 * in a document and two different people never collide.
 *
 * Two properties matter, and both are easy to get subtly wrong:
 *
 * 1. **Document scope, not page scope.** A PDF runs detection once per page, so
 *    the book has to be created before the page loop or "Jane Doe" would be
 *    `[PERSON_1]` on every page independently.
 *
 * 2. **Stability across re-runs.** The whole pipeline re-runs whenever the user
 *    un-redacts an item, so numbering must depend only on the text and options —
 *    never on which items are currently excluded. That is why `register` is
 *    called with *all* matches, before exclusions are applied. Excluding an item
 *    then leaves a gap in the numbering (no `[PERSON_2]` anywhere) rather than
 *    renumbering everything after it, which would make every other token on
 *    screen change under the user's cursor.
 */
export interface PseudonymBook {
  /** The token for a value, assigning a new one on first sight. */
  tokenFor(category: PIICategory, text: string): string;
  /** Pre-assign tokens in match order. Call before applying exclusions. */
  register(matches: readonly PIIMatch[]): void;
  size(): number;
}

export function createPseudonymBook(): PseudonymBook {
  const tokens = new Map<string, string>();
  const counters = new Map<PIICategory, number>();

  const tokenFor = (category: PIICategory, text: string): string => {
    const def = CATEGORY_DEFS[category];
    const key = `${category}:${def.pseudonymKey(text)}`;

    const existing = tokens.get(key);
    if (existing) return existing;

    const next = (counters.get(category) ?? 0) + 1;
    counters.set(category, next);

    const token = `[${def.pseudonymPrefix}_${next}]`;
    tokens.set(key, token);
    return token;
  };

  return {
    tokenFor,
    register(matches) {
      for (const match of matches) tokenFor(match.category, match.text);
    },
    size: () => tokens.size,
  };
}

/**
 * The single place a replacement string is produced. `summarize` calls it and
 * stores the result on the item; the renderer reads that stored value rather
 * than recomputing. One code path means the summary panel and the downloaded
 * file cannot drift apart.
 */
export function replacementFor(
  match: Pick<PIIMatch, "category" | "text">,
  mode: ReplacementMode,
  book: PseudonymBook
): string {
  switch (mode) {
    case "label":
      return `[${CATEGORY_DEFS[match.category].label}]`;
    case "pseudonym":
      return book.tokenFor(match.category, match.text);
    case "redacted":
    default:
      return REDACTED;
  }
}

export const REPLACEMENT_MODE_LABELS: Record<ReplacementMode, string> = {
  redacted: "[REDACTED]",
  label: "Category labels",
  pseudonym: "Consistent pseudonyms",
};

export const REPLACEMENT_MODE_HINTS: Record<ReplacementMode, string> = {
  redacted: "Every match becomes the same placeholder.",
  label: "Shows what kind of value was removed, but not which one.",
  pseudonym:
    "The same value always gets the same token, so the file stays analysable.",
};
