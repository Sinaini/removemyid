import type * as Tesseract from "tesseract.js";
import type { PIIMatch } from "../../types";

export interface OcrWord {
  start: number;
  end: number;
  bbox: Tesseract.Bbox;
}

export interface OcrText {
  text: string;
  words: OcrWord[];
}

// Flattens Tesseract's block > paragraph > line > word tree into one string
// (for the existing regex/NLP detectors to run on) plus a list of words with
// their char offsets into that string, mirroring how extractPageText.ts maps
// PDF text items to offsets.
export function flattenWords(page: Tesseract.Page): OcrText {
  const words: OcrWord[] = [];
  let text = "";

  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          if (!word.text) continue;
          if (text.length > 0) text += " ";
          const start = text.length;
          text += word.text;
          words.push({ start, end: text.length, bbox: word.bbox });
        }
        // A newline between OCR lines (rather than a space) keeps the NLP
        // name/place detector from merging words across unrelated lines —
        // e.g. a label on one line bleeding into a name on the next.
        if (line.words.length > 0) text += "\n";
      }
    }
  }

  return { text, words };
}

// Word-granularity boxes: if any part of a matched span overlaps a word,
// black out that word's whole bounding box. Coarser than the PDF text-layer
// path's character-precise boxes, but over-covering by a word is the safe
// failure mode for a redaction tool.
export function ocrBoxesForMatch(match: PIIMatch, words: OcrWord[]): Tesseract.Bbox[] {
  return words
    .filter((word) => word.start < match.end && word.end > match.start)
    .map((word) => word.bbox);
}
