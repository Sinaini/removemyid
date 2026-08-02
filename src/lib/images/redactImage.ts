import type * as Tesseract from "tesseract.js";
import { getOcrWorker } from "./ocrSetup";
import {
  findAllMatches,
  summarize,
  excludeMatches,
} from "../redaction/redact";
import type { PIIMatch, RedactionOptions, RedactionSummary } from "../../types";

interface OcrWord {
  start: number;
  end: number;
  bbox: Tesseract.Bbox;
}

interface OcrText {
  text: string;
  words: OcrWord[];
}

// Flattens Tesseract's block > paragraph > line > word tree into one string
// (for the existing regex/NLP detectors to run on) plus a list of words with
// their char offsets into that string, mirroring how extractPageText.ts maps
// PDF text items to offsets.
function flattenWords(page: Tesseract.Page): OcrText {
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
// black out that word's whole bounding box. Coarser than the PDF path's
// character-precise boxes, but over-covering by a word is the safe failure
// mode for a redaction tool.
function boxesForMatch(match: PIIMatch, words: OcrWord[]): Tesseract.Bbox[] {
  return words
    .filter((word) => word.start < match.end && word.end > match.start)
    .map((word) => word.bbox);
}

export interface ProcessedImage {
  blob: Blob;
  summary: RedactionSummary;
}

export async function redactImageFile(
  file: File,
  options?: RedactionOptions,
  excludedIds?: ReadonlySet<string>
): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire a 2D canvas context");

  // Drawing (and later re-encoding) through the canvas strips all EXIF
  // metadata — GPS coordinates, device info, timestamps — as a side effect,
  // since canvas never round-trips it.
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const { text, words } = flattenWords(data);

  const matches = excludeMatches(findAllMatches(text, options), excludedIds);
  const summary = summarize(matches);

  ctx.fillStyle = "#000000";
  for (const match of matches) {
    for (const box of boxesForMatch(match, words)) {
      ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    }
  }

  const mimeType = file.type || "image/png";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType)
  );
  if (!blob) throw new Error("Failed to encode the redacted image");

  return { blob, summary };
}
