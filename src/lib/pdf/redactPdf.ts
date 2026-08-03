import "./pdfjsSetup";
import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageViewport } from "pdfjs-dist";
import { PDFDocument as PdfLibDocument } from "pdf-lib";
import {
  extractPageText,
  type PageTextData,
  type PdfTextItem,
} from "./extractPageText";
import {
  findAllMatches,
  summarize,
  mergeSummaries,
  excludeMatches,
} from "../redaction/redact";
import type { PIIMatch, RedactionOptions, RedactionSummary } from "../../types";

const RENDER_SCALE = 2;
// Mobile Safari (and WebKit-based iOS browsers generally) refuse to allocate
// canvases much beyond ~4096x4096 and silently fail/produce a blank surface
// past that, rather than throwing a descriptive error. Clamp the rasterized
// resolution per-page so a large/high-DPI page doesn't exceed that ceiling.
const MAX_CANVAS_AREA = 4096 * 4096;
const BOX_PADDING = 2;
const ASCENT_RATIO = 0.82;
const BOX_HEIGHT_RATIO = 1.05;
// Horizontal padding as a fraction of font size, not a flat pixel value, so
// it scales with text size and with RENDER_SCALE.
const HORIZONTAL_PAD_RATIO = 0.18;

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Uses the canvas's own font metrics (measureText) to find where a substring
// starts/ends within an item, rather than assuming uniform glyph width. Since
// the substituted browser font never matches the PDF's embedded font exactly,
// we additionally rescale by the ratio between pdf.js's authoritative full
// item width and our measured full-string width, correcting for that
// mismatch. Any residual error is absorbed by BOX_PADDING — over-covering by
// a couple pixels is the safe failure mode for a redaction tool.
function measurePartialWidths(
  ctx: CanvasRenderingContext2D,
  item: PdfTextItem,
  styles: PageTextData["styles"],
  viewport: PageViewport,
  charStart: number,
  charEnd: number
): { startPx: number; endPx: number } {
  const fontFamily = styles[item.fontName]?.fontFamily || "sans-serif";
  const fontSizePx = item.height * viewport.scale;
  ctx.font = `${fontSizePx}px ${fontFamily}`;

  const measuredFullWidth = ctx.measureText(item.str).width || 1;
  const realFullWidth = item.width * viewport.scale;
  const correction = realFullWidth / measuredFullWidth;
  const horizontalPad = fontSizePx * HORIZONTAL_PAD_RATIO;

  const rawStartPx = ctx.measureText(item.str.slice(0, charStart)).width * correction;
  const rawEndPx = ctx.measureText(item.str.slice(0, charEnd)).width * correction;

  return {
    startPx: rawStartPx - horizontalPad,
    endPx: rawEndPx + horizontalPad,
  };
}

function itemToCanvasBox(
  ctx: CanvasRenderingContext2D,
  item: PdfTextItem,
  styles: PageTextData["styles"],
  viewport: PageViewport,
  charStart: number,
  charEnd: number
): CanvasBox {
  const combined = Util.transform(viewport.transform, item.transform);
  const [, , , , e, f] = combined;
  const canvasHeight = item.height * viewport.scale;

  const { startPx, endPx } = measurePartialWidths(
    ctx,
    item,
    styles,
    viewport,
    charStart,
    charEnd
  );

  return {
    x: e + startPx - BOX_PADDING,
    y: f - canvasHeight * ASCENT_RATIO - BOX_PADDING,
    width: endPx - startPx + BOX_PADDING * 2,
    height: canvasHeight * BOX_HEIGHT_RATIO + BOX_PADDING * 2,
  };
}

function boxesForMatch(
  ctx: CanvasRenderingContext2D,
  match: PIIMatch,
  items: PdfTextItem[],
  styles: PageTextData["styles"],
  viewport: PageViewport
): CanvasBox[] {
  return items
    .filter((item) => item.start < match.end && item.end > match.start)
    .map((item) => {
      const overlapStart = Math.max(item.start, match.start);
      const overlapEnd = Math.min(item.end, match.end);
      return itemToCanvasBox(
        ctx,
        item,
        styles,
        viewport,
        overlapStart - item.start,
        overlapEnd - item.start
      );
    });
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("Failed to rasterize page to an image");
  return new Uint8Array(await blob.arrayBuffer());
}

export interface ProcessedPdf {
  blob: Blob;
  summary: RedactionSummary;
}

export async function redactPdfFile(
  file: File,
  options?: RedactionOptions,
  excludedIds?: ReadonlySet<string>
): Promise<ProcessedPdf> {
  const bytes = await file.arrayBuffer();
  const pdf = await getDocument({ data: bytes }).promise;
  const outDoc = await PdfLibDocument.create();
  const pageSummaries: RedactionSummary[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const { text, items, styles } = await extractPageText(page);
    const matches = excludeMatches(findAllMatches(text, options), excludedIds, pageNum);
    pageSummaries.push(summarize(matches, pageNum));

    const baseViewport = page.getViewport({ scale: 1 });
    const maxScale = Math.sqrt(MAX_CANVAS_AREA / (baseViewport.width * baseViewport.height));
    const scale = Math.min(RENDER_SCALE, maxScale);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire a 2D canvas context");

    // "print" intent avoids pdf.js's interactive rendering path, which can
    // stall indefinitely on a backgrounded/inactive tab.
    await page.render({
      canvas: null,
      canvasContext: ctx,
      viewport,
      intent: "print",
    }).promise;

    ctx.fillStyle = "#000000";
    for (const match of matches) {
      for (const box of boxesForMatch(ctx, match, items, styles, viewport)) {
        ctx.fillRect(box.x, box.y, box.width, box.height);
      }
    }

    const pngBytes = await canvasToPngBytes(canvas);
    const pngImage = await outDoc.embedPng(pngBytes);

    const pageWidthPt = viewport.width / scale;
    const pageHeightPt = viewport.height / scale;
    const outPage = outDoc.addPage([pageWidthPt, pageHeightPt]);
    outPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    });

    page.cleanup();
  }

  const outBytes = await outDoc.save();
  const blob = new Blob([new Uint8Array(outBytes)], { type: "application/pdf" });
  return { blob, summary: mergeSummaries(pageSummaries) };
}
