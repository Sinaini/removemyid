import { TextViewBuilder, type TextView } from "../pipeline/offsetMap";

// CSV, parsed as CSV.
//
// It was previously treated as plain text, which has two consequences. A
// replacement landing inside a quoted field can break the row structure (if the
// original value contained the delimiter, the quotes that protected it no longer
// match up), and detection sees the raw delimiters as content — so a `First,Last`
// column pair reads as one run of characters with a comma in it rather than two
// fields.

export type Delimiter = "," | ";" | "\t" | "|";

export interface CsvCell {
  row: number;
  col: number;
  /** The field's logical value, with surrounding quotes and escapes resolved. */
  value: string;
  /** Offsets of the raw field (including quotes) in the source text. */
  start: number;
  end: number;
  quoted: boolean;
}

export interface CsvDoc {
  cells: CsvCell[];
  rows: number;
  delimiter: Delimiter;
  eol: "\n" | "\r\n";
}

const DELIMITERS: Delimiter[] = [",", ";", "\t", "|"];

/**
 * Pick the delimiter by consistency of field count across the first rows, not by
 * raw frequency — prose full of commas would otherwise beat a genuine
 * semicolon-delimited European export.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).filter((line) => line.length > 0).slice(0, 10);
  if (sample.length === 0) return ",";

  let best: Delimiter = ",";
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = sample.map((line) => countOutsideQuotes(line, delimiter) + 1);
    const first = counts[0];
    if (first < 2) continue;

    const consistent = counts.filter((count) => count === first).length;
    // Prefer consistency, then more columns as the tie-break.
    const score = consistent * 100 + first;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }
  return count;
}

export function parseCsv(text: string, delimiter?: Delimiter): CsvDoc {
  const sep = delimiter ?? detectDelimiter(text);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";

  const cells: CsvCell[] = [];
  let row = 0;
  let col = 0;
  let i = 0;

  while (i <= text.length) {
    if (i === text.length) {
      // A trailing newline means there is no final empty field to record.
      if (i > 0 && text[i - 1] !== "\n") {
        cells.push({ row, col, value: "", start: i, end: i, quoted: false });
      }
      break;
    }

    const fieldStart = i;
    let value = "";
    let quoted = false;

    if (text[i] === '"') {
      quoted = true;
      i += 1;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          value += text[i];
          i += 1;
        }
      }
    } else {
      while (i < text.length && text[i] !== sep && text[i] !== "\n" && text[i] !== "\r") {
        value += text[i];
        i += 1;
      }
    }

    cells.push({ row, col, value, start: fieldStart, end: i, quoted });

    if (i < text.length && text[i] === sep) {
      i += 1;
      col += 1;
      continue;
    }

    if (i < text.length && (text[i] === "\r" || text[i] === "\n")) {
      if (text[i] === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;
      row += 1;
      col = 0;
      continue;
    }

    // Ran off the end mid-field.
    break;
  }

  return { cells, rows: row + (cells.length > 0 ? 1 : 0), delimiter: sep, eol };
}

/**
 * A flat view of the cell *values* for the detectors, with cells joined by a
 * space within a row and a newline between rows.
 *
 * The joins are separators, so no match offset can ever land on a delimiter or a
 * quote character — that is what makes reconstruction safe. Joining with a space
 * rather than the raw delimiter also gives the NLP detector real word boundaries,
 * so a `First,Last` column pair still yields a person.
 */
export function csvTextView(doc: CsvDoc): TextView {
  const builder = new TextViewBuilder();
  let currentRow = 0;

  doc.cells.forEach((cell, index) => {
    if (index > 0) {
      builder.pushSeparator(cell.row !== currentRow ? "\n" : " ");
      currentRow = cell.row;
    }
    builder.push(cell.value, cell.start, cell.end, index);
  });

  return builder.build();
}

const NEEDS_QUOTING = /["\r\n]/;

/**
 * Rebuild the CSV with replacement values, re-quoting any field that now needs
 * it. Because each field is emitted from its logical value, a `[REDACTED]` (or
 * any replacement) landing in a quoted field cannot corrupt the row — the
 * quoting is derived from the new content rather than inherited from the old.
 */
export function serializeCsv(
  doc: CsvDoc,
  newValues: ReadonlyMap<number, string>
): string {
  const parts: string[] = [];
  let currentRow = 0;

  doc.cells.forEach((cell, index) => {
    if (index > 0) {
      parts.push(cell.row !== currentRow ? doc.eol : doc.delimiter);
      currentRow = cell.row;
    }

    const value = newValues.get(index) ?? cell.value;
    const mustQuote =
      value.includes(doc.delimiter) || NEEDS_QUOTING.test(value) || (cell.quoted && value === "");

    parts.push(mustQuote ? `"${value.replace(/"/g, '""')}"` : value);
  });

  return parts.join("");
}
