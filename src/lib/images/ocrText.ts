import type * as Tesseract from "tesseract.js";
import type { PIIMatch } from "../../types";

export interface OcrWord {
  start: number;
  end: number;
  bbox: Tesseract.Bbox;
  /** 0-100. Low values mark text the engine was unsure of. */
  confidence: number;
}

export interface OcrText {
  text: string;
  words: OcrWord[];
  /** Mean word confidence across the page, 0-100. 100 when there are no words. */
  meanConfidence: number;
}

// Flattens Tesseract's block > paragraph > line > word tree into one string
// (for the existing regex/NLP detectors to run on) plus a list of words with
// their char offsets into that string, mirroring how extractPageText.ts maps
// PDF text items to offsets.
export function flattenWords(page: Tesseract.Page): OcrText {
  const words: OcrWord[] = [];
  const parts: string[] = [];
  let length = 0;
  let confidenceSum = 0;

  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        let wordsOnLine = 0;

        for (const word of line.words) {
          if (!word.text) continue;

          // Separate words within a line with a single space. The check is
          // against `wordsOnLine` rather than total length so the space is not
          // added straight after the newline that ended the previous line.
          if (wordsOnLine > 0) {
            parts.push(" ");
            length += 1;
          }

          const start = length;
          parts.push(word.text);
          length += word.text.length;

          const confidence = typeof word.confidence === "number" ? word.confidence : 0;
          confidenceSum += confidence;
          words.push({ start, end: length, bbox: word.bbox, confidence });
          wordsOnLine += 1;
        }

        // A newline between OCR lines (rather than a space) keeps the NLP
        // name/place detector from merging words across unrelated lines —
        // e.g. a label on one line bleeding into a name on the next.
        if (wordsOnLine > 0) {
          parts.push("\n");
          length += 1;
        }
      }
    }
  }

  return {
    text: parts.join(""),
    words,
    meanConfidence: words.length > 0 ? confidenceSum / words.length : 100,
  };
}

// Word-granularity boxes: if any part of a matched span overlaps a word,
// black out that word's whole bounding box. Coarser than the PDF text-layer
// path's character-precise boxes, but over-covering by a word is the safe
// failure mode for a redaction tool.
export function ocrBoxesForMatch(
  match: PIIMatch,
  words: readonly OcrWord[]
): Tesseract.Bbox[] {
  return words
    .filter((word) => word.start < match.end && word.end > match.start)
    .map((word) => word.bbox);
}

/** Spans the engine was unsure about, for highlighting risky regions. */
export function lowConfidenceSpans(
  words: readonly OcrWord[],
  threshold = 60
): { start: number; end: number }[] {
  return words
    .filter((word) => word.confidence < threshold)
    .map((word) => ({ start: word.start, end: word.end }));
}
