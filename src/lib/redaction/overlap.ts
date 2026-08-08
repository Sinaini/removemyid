import type { PIICategory, PIIMatch } from "../../types";
import { CATEGORY_DEFS } from "./registry";

// Overlap resolution: turn a pile of possibly-overlapping detector hits into a
// non-overlapping, start-ascending list.
//
// This is the most consequential ~60 lines in the app. The previous version
// dropped an overlapping match *whole*:
//
//     for (const match of sorted) {
//       if (match.start < lastEnd) continue;   // <-- silently discards it
//       ...
//     }
//
// So given an email at [0,10) and a person span at [3,30), the person span was
// discarded entirely and characters 10..30 were written to the output in the
// clear — while the summary reported both. That is the worst failure mode a
// redaction tool has: under-coverage reported as success.
//
// The rule here is therefore: never drop a match because it overlaps. Merge it
// or trim it, so the union of the input spans is always covered by the union of
// the output spans. `overlap.test.ts` asserts exactly that as a property.

const WORD_CHAR = /[\p{L}\p{N}_]/u;
// A remainder made only of whitespace and punctuation carries no PII, so
// keeping it would just produce a stray "[REDACTED]" around a comma.
const SEPARATOR_ONLY = /^[\s\p{P}\p{S}]*$/u;

function priorityOf(category: PIICategory): number {
  return CATEGORY_DEFS[category].priority;
}

function isWordChar(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  return WORD_CHAR.test(text[index]);
}

export function resolveOverlaps(
  matches: readonly PIIMatch[],
  text: string
): PIIMatch[] {
  if (matches.length <= 1) return [...matches];

  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    // Priority BEFORE length. The old comparator sorted by length first, which
    // made the priority table effectively dead code: a long `person` span beat
    // a short `email` span at the same offset, the exact opposite of what the
    // table documented.
    const priorityDiff = priorityOf(a.category) - priorityOf(b.category);
    if (priorityDiff !== 0) return priorityDiff;
    return b.end - b.start - (a.end - a.start);
  });

  const kept: PIIMatch[] = [];
  // Monotonic high-water mark. The old code assigned `lastEnd = match.end`
  // unconditionally, so a short match kept after a long one could move the
  // watermark *backwards* and re-admit spans from inside an already-covered
  // region while leaving the middle uncovered.
  let cursor = -1;

  for (const match of sorted) {
    if (match.end <= cursor) {
      // Entirely inside something already covered. This is the only case where
      // dropping is safe, because the text is redacted either way.
      continue;
    }

    if (match.start >= cursor) {
      kept.push({ ...match });
      cursor = match.end;
      continue;
    }

    // Partial overlap with the last kept match.
    const previous = kept[kept.length - 1];

    if (previous.category === match.category) {
      // One logical value that two patterns saw slightly differently — merge,
      // so the output gets a single "[REDACTED]" and the count stays honest
      // rather than reporting the same value twice.
      extend(previous, match.end, text);
      cursor = previous.end;
      continue;
    }

    // Different categories. Trimming to [cursor, match.end) is only acceptable
    // if the cut lands on a token boundary. Cutting mid-token is precisely the
    // "[REDACTED]67" shape — half a phone number left in the clear — so in that
    // case absorb the whole thing into the previous match instead.
    if (isWordChar(text, cursor - 1) && isWordChar(text, cursor)) {
      extend(previous, match.end, text);
      cursor = previous.end;
      continue;
    }

    const remainder = text.slice(cursor, match.end);
    if (SEPARATOR_ONLY.test(remainder)) continue;

    kept.push({
      ...match,
      start: cursor,
      end: match.end,
      text: remainder,
    });
    cursor = match.end;
  }

  return kept;
}

function extend(match: PIIMatch, newEnd: number, text: string): void {
  if (newEnd <= match.end) return;
  match.end = newEnd;
  match.text = text.slice(match.start, match.end);
}
