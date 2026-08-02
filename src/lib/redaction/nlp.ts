import nlp from "compromise";
import type { PIICategory, PIIMatch } from "../../types";

interface CompromiseTerm {
  offset: { start: number; length: number };
}

interface CompromiseMatch {
  terms: CompromiseTerm[];
}

function extractMatches(
  matches: CompromiseMatch[],
  text: string,
  category: PIICategory
): PIIMatch[] {
  const results: PIIMatch[] = [];

  for (const match of matches) {
    if (match.terms.length === 0) continue;
    const first = match.terms[0];
    const last = match.terms[match.terms.length - 1];
    const start = first.offset.start;
    const end = last.offset.start + last.offset.length;
    results.push({
      category,
      start,
      end,
      text: text.slice(start, end),
    });
  }

  return results;
}

export function findPeople(text: string): PIIMatch[] {
  const doc = nlp(text);
  const matches = doc.people().json({ offset: true }) as CompromiseMatch[];
  return extractMatches(matches, text, "person");
}

export function findPlaces(text: string): PIIMatch[] {
  const doc = nlp(text);
  const matches = doc.places().json({ offset: true }) as CompromiseMatch[];
  return extractMatches(matches, text, "place");
}
