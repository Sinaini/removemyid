import { getOcrWorker } from "./ocrSetup";
import { flattenWords, ocrBoxesForMatch } from "./ocrText";
import { decodeImage } from "./decodeImage";
import { encodeCanvas } from "./encodeImage";
import { createClampedCanvas, releaseCanvas } from "./canvas";
import { throwIfAborted } from "../pipeline/abort";
import { findAllMatches, summarize, excludeMatches } from "../redaction/redact";
import type { RedactionOptions, RedactionSummary } from "../../types";

export type ImageWarningCode = "downscaled" | "reencoded" | "low-confidence";

export interface ImageWarning {
  code: ImageWarningCode;
  detail: string;
}

export interface ProcessedImage {
  blob: Blob;
  summary: RedactionSummary;
  /** Extension matching the actual output bytes, without a dot. */
  extension: string;
  warnings: ImageWarning[];
}

export interface RedactImageOptions {
  signal?: AbortSignal;
  onProgress?: (event: { stage: string }) => void;
}

/** Mean OCR confidence below this means the recognised text is unreliable. */
const LOW_CONFIDENCE_MEAN = 70;

export async function redactImageFile(
  file: File,
  options?: RedactionOptions,
  excludedIds?: ReadonlySet<string>,
  runOptions: RedactImageOptions = {}
): Promise<ProcessedImage> {
  const { signal, onProgress } = runOptions;
  const warnings: ImageWarning[] = [];

  onProgress?.({ stage: "Reading the image" });
  const decoded = await decodeImage(file);
  let canvas: HTMLCanvasElement | null = null;

  try {
    throwIfAborted(signal);

    // The PDF path clamped its canvas for mobile WebKit; this path did not, so a
    // 12MP phone photo exceeded the limit, drawImage produced a blank surface,
    // and toBlob still resolved — handing the user a corrupt image alongside a
    // "success" summary. Allocating through createClampedCanvas makes that
    // impossible.
    const clamped = createClampedCanvas(decoded.width, decoded.height);
    canvas = clamped.canvas;
    const ctx = clamped.ctx;

    if (clamped.scale < 1) {
      warnings.push({
        code: "downscaled",
        detail: `The image was scaled from ${decoded.width}x${decoded.height} to ${canvas.width}x${canvas.height}, which is the largest this browser can process reliably.`,
      });
    }

    // Drawing (and later re-encoding) through the canvas strips all EXIF
    // metadata — GPS coordinates, device info, timestamps — as a side effect,
    // since canvas never round-trips it.
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    decoded.release();

    throwIfAborted(signal);
    onProgress?.({ stage: "Recognising text" });

    // OCR runs on the already-scaled canvas, so the word boxes it returns are
    // in output coordinates. Recognising the full-size image and rescaling the
    // boxes afterwards would add a whole class of off-by-scale misplacement.
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    throwIfAborted(signal);

    const { text, words, meanConfidence } = flattenWords(data);

    if (words.length > 0 && meanConfidence < LOW_CONFIDENCE_MEAN) {
      warnings.push({
        code: "low-confidence",
        detail: `Text recognition was uncertain (about ${Math.round(meanConfidence)}% confident). Anything the OCR could not read will not have been found — check the image before relying on it.`,
      });
    }

    const matches = excludeMatches(findAllMatches(text, options), excludedIds);
    const summary = summarize(matches, undefined, "ocr");

    ctx.fillStyle = "#000000";
    for (const match of matches) {
      for (const box of ocrBoxesForMatch(match, words)) {
        ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
      }
    }

    onProgress?.({ stage: "Saving the image" });
    const encoded = await encodeCanvas(canvas, file.type || "image/png");

    if (encoded.substituted) {
      warnings.push({
        code: "reencoded",
        detail: `This browser cannot write ${file.type || "that format"}, so the redacted image was saved as ${encoded.extension.toUpperCase()} instead.`,
      });
    }

    return {
      blob: encoded.blob,
      summary,
      extension: encoded.extension,
      warnings,
    };
  } finally {
    decoded.release();
    releaseCanvas(canvas);
  }
}
