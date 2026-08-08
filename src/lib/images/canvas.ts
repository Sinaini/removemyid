// Canvas allocation, centralised.
//
// Mobile WebKit refuses to allocate canvases past roughly 4096x4096 and — the
// part that makes this dangerous — does so *silently*, handing back a blank
// surface instead of throwing. In a redaction tool that means the user
// downloads a blank or corrupt file while the summary cheerfully reports
// everything was redacted.
//
// The PDF path had a clamp; the image path did not, so a 12MP phone photo
// produced exactly that failure. Rather than adding a second clamp that can
// drift from the first, both paths now allocate through here — there is no
// other way to make a canvas in this codebase, so the bug cannot come back.

export const MAX_CANVAS_AREA = 4096 * 4096;
/** WebKit caps a single dimension too, not just the total area. */
export const MAX_CANVAS_DIM = 4096;

export interface ClampedCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /**
   * The scale actually applied (1 when no clamping was needed). Callers MUST
   * multiply any coordinates derived from the unclamped dimensions by this,
   * or every box lands in the wrong place.
   */
  scale: number;
}

/**
 * Returns the largest scale <= 1 that fits `width x height` inside both the
 * area and per-dimension ceilings.
 */
export function clampScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;

  const areaScale = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  const dimScale = MAX_CANVAS_DIM / Math.max(width, height);
  return Math.min(1, areaScale, dimScale);
}

export function createClampedCanvas(width: number, height: number): ClampedCanvas {
  const scale = clampScale(width, height);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire a 2D canvas context");

  return { canvas, ctx, scale };
}

/**
 * Free a canvas's backing store immediately rather than waiting for GC. A
 * 4096x4096 surface is ~67MB, so a multi-page PDF loop that doesn't do this
 * accumulates hundreds of megabytes and crashes the tab on mobile.
 */
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  try {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  } catch {
    // A lost/failed context can't be cleared; zeroing the size below is what
    // actually releases the memory, so this is not worth surfacing.
  }
  canvas.width = 0;
  canvas.height = 0;
}
