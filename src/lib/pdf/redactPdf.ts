import "./pdfjsSetup";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { extractPageText } from "./extractPageText";
import { assessTextLayer, shouldOcr } from "./textDensity";
import { fillQuad } from "./geometry";
import { canvasMeasurer, quadsForMatch } from "./boxes";
import { encodePage, pickEncoding } from "./encodePage";
import { getOcrWorker } from "../images/ocrSetup";
import { flattenWords, ocrBoxesForMatch } from "../images/ocrText";
import { createClampedCanvas, releaseCanvas } from "../images/canvas";
import { throwIfAborted } from "../pipeline/abort";
import {
  findAllMatches,
  createRedactionContext,
  mergeSummaries,
  excludeMatches,
} from "../redaction/redact";
import type {
  PIIMatch,
  RedactionOptions,
  RedactionSummary,
  ReplacementMode,
} from "../../types";

const RENDER_SCALE = 2;

export type PdfWarningCode =
  | "scanned-page"
  | "low-text-density"
  | "bidi-whole-run"
  | "output-large";

export interface PdfWarning {
  code: PdfWarningCode;
  page?: number;
  detail?: string;
}

export interface ProcessedPdf {
  blob: Blob;
  summary: RedactionSummary;
  warnings: PdfWarning[];
}

export interface RedactPdfOptions {
  signal?: AbortSignal;
  onProgress?: (event: { stage: string; current: number; total: number }) => void;
  /**
   * Affects the summary only. The output PDF is a flattened image with solid
   * black boxes drawn on it — there is no text in the file to substitute, so a
   * label or pseudonym cannot appear there. The UI has to say this plainly
   * rather than letting the setting look like it did nothing.
   */
  replacementMode?: ReplacementMode;
}

/**
 * Identity of a *reported* value, used to stop the text-layer and OCR passes
 * both listing the same visible thing. Whitespace and case are normalised
 * because OCR routinely differs from the text layer on both.
 */
function reportKey(category: string, text: string): string {
  return `${category}:${text.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export async function redactPdfFile(
  file: File,
  options?: RedactionOptions,
  excludedIds?: ReadonlySet<string>,
  runOptions: RedactPdfOptions = {}
): Promise<ProcessedPdf> {
  const { signal, onProgress, replacementMode = "redacted" } = runOptions;

  // Created once for the whole document, before the page loop, so a pseudonym
  // means the same person on page 1 and page 9.
  const context = createRedactionContext(replacementMode);

  const bytes = await file.arrayBuffer();
  const loadingTask = getDocument({ data: bytes });
  // Without this, cancelling leaves pdf.js parsing in its own worker long after
  // the UI has moved on.
  const onAbort = () => void loadingTask.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });

  const warnings: PdfWarning[] = [];

  try {
    const pdf = await loadingTask.promise;
    const outDoc = await PdfLibDocument.create();
    const pageSummaries: RedactionSummary[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      throwIfAborted(signal);
      onProgress?.({ stage: "Reading page", current: pageNum, total: pdf.numPages });

      const page = await pdf.getPage(pageNum);
      let canvas: HTMLCanvasElement | null = null;

      try {
        const baseViewport = page.getViewport({ scale: 1 });
        // The clamp lives in createClampedCanvas, so the render scale is chosen
        // against the same ceiling the canvas will actually be allocated with.
        const wanted = page.getViewport({ scale: RENDER_SCALE });
        const clamped = createClampedCanvas(wanted.width, wanted.height);
        canvas = clamped.canvas;
        const ctx = clamped.ctx;

        const scale = RENDER_SCALE * clamped.scale;
        const viewport = page.getViewport({ scale });

        const { text, items, styles } = await extractPageText(page, viewport);
        throwIfAborted(signal);

        // "print" intent avoids pdf.js's interactive rendering path, which can
        // stall indefinitely on a backgrounded/inactive tab.
        const renderTask = page.render({
          canvas: null,
          canvasContext: ctx,
          viewport,
          intent: "print",
        });
        const cancelRender = () => renderTask.cancel();
        signal?.addEventListener("abort", cancelRender, { once: true });
        try {
          await renderTask.promise;
        } finally {
          signal?.removeEventListener("abort", cancelRender);
        }
        throwIfAborted(signal);

        ctx.fillStyle = "#000000";
        const measurer = canvasMeasurer(ctx);

        const density = assessTextLayer(items, viewport);

        // Text-layer matches. Retained so the OCR pass below can tell which of
        // its findings are genuinely new.
        let pageTextMatches: PIIMatch[] = [];
        if (items.length > 0) {
          const matches = excludeMatches(
            findAllMatches(text, options),
            excludedIds,
            pageNum,
            "text"
          );
          pageTextMatches = matches;
          context.register(matches);
          pageSummaries.push(context.summarize(matches, pageNum, "text"));

          let anyWholeRun = false;
          for (const match of matches) {
            const { quads, usedWholeRun } = quadsForMatch(
              measurer,
              match,
              items,
              styles
            );
            if (usedWholeRun) anyWholeRun = true;
            for (const quad of quads) fillQuad(ctx, quad);
          }
          if (anyWholeRun) {
            warnings.push({
              code: "bidi-whole-run",
              page: pageNum,
              detail:
                "Right-to-left text was covered a whole run at a time, which can black out slightly more than the matched value.",
            });
          }
        }

        // OCR matches, run *in addition to* the text layer rather than only when
        // the text layer is empty. The old `items.length === 0` gate meant a
        // scanned page carrying a single stamped header skipped OCR entirely and
        // the whole page went unredacted.
        if (shouldOcr(density)) {
          throwIfAborted(signal);
          onProgress?.({
            stage: `Reading page ${pageNum} with OCR`,
            current: pageNum,
            total: pdf.numPages,
          });

          const worker = await getOcrWorker();
          const { data } = await worker.recognize(canvas, {}, { blocks: true });
          throwIfAborted(signal);

          const { text: ocrText, words } = flattenWords(data);
          const matches = excludeMatches(
            findAllMatches(ocrText, options),
            excludedIds,
            pageNum,
            "ocr"
          );

          // Every OCR match gets a box — over-covering is the safe direction, and
          // the two passes read different coordinate spaces so there is no
          // reliable way to know a text-layer box already covered this glyph.
          for (const match of matches) {
            for (const box of ocrBoxesForMatch(match, words)) {
              ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
            }
          }

          // The *summary*, though, must not list the same visible value twice
          // just because both passes found it — that inflates the counts and
          // makes the results list look broken. Report only what OCR found that
          // the text layer did not.
          const alreadyReported = new Set(
            pageTextMatches.map((m) => reportKey(m.category, m.text))
          );
          const novel = matches.filter(
            (m) => !alreadyReported.has(reportKey(m.category, m.text))
          );
          context.register(novel);
          pageSummaries.push(context.summarize(novel, pageNum, "ocr"));

          warnings.push({
            code: "scanned-page",
            page: pageNum,
            detail:
              "Some pages had little or no selectable text, so they were read with OCR. OCR can miss text that is blurry, handwritten or heavily styled — check the result.",
          });
        }

        const encoding = await encodePage(canvas, pickEncoding(canvas, density.looksScanned));
        const image =
          encoding.kind === "jpeg"
            ? await outDoc.embedJpg(encoding.bytes)
            : await outDoc.embedPng(encoding.bytes);

        const pageWidthPt = baseViewport.width;
        const pageHeightPt = baseViewport.height;
        const outPage = outDoc.addPage([pageWidthPt, pageHeightPt]);
        outPage.drawImage(image, {
          x: 0,
          y: 0,
          width: pageWidthPt,
          height: pageHeightPt,
        });
      } finally {
        // A 4096x4096 canvas is ~67MB. Without releasing each page's surface,
        // a long document accumulates hundreds of megabytes and crashes the tab
        // on mobile Safari.
        releaseCanvas(canvas);
        page.cleanup();
      }
    }

    const outBytes = await outDoc.save();
    const blob = new Blob([new Uint8Array(outBytes)], { type: "application/pdf" });

    if (blob.size > file.size * 3 && blob.size > 5 * 1024 * 1024) {
      warnings.push({
        code: "output-large",
        detail:
          "The redacted PDF is much larger than the original, because every page is rebuilt as a flattened image.",
      });
    }

    return { blob, summary: mergeSummaries(pageSummaries), warnings };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
