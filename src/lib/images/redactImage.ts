import { getOcrWorker } from "./ocrSetup";
import { flattenWords, ocrBoxesForMatch } from "./ocrText";
import {
  findAllMatches,
  summarize,
  excludeMatches,
} from "../redaction/redact";
import type { RedactionOptions, RedactionSummary } from "../../types";

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
    for (const box of ocrBoxesForMatch(match, words)) {
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
