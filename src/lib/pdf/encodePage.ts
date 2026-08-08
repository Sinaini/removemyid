// Page raster encoding.
//
// Every page of the output PDF is a flattened image — that's what guarantees no
// residual text layer to copy out. But encoding every page as PNG turned a
// 200KB text PDF into tens of megabytes, because PNG is lossless and a
// rasterised text page is mostly noise-free but very large.
//
// So: PNG for pages that are genuinely flat graphics (crisp text on white,
// where PNG is both smaller and sharper) and JPEG for scans and photographic
// pages (where PNG is enormous and JPEG is visually equivalent).

export type PageEncodingKind = "jpeg" | "png";

export interface PageEncoding {
  kind: PageEncodingKind;
  bytes: Uint8Array;
  mimeType: string;
}

const JPEG_QUALITY = 0.82;
/** Above this many distinct colours in a sample, treat the page as photographic. */
const PHOTO_UNIQUE_COLOURS = 500;
const SAMPLE_TARGET = 1000;

/**
 * Sample a grid of pixels and count distinct colours. Cheap heuristic, and it
 * only has to be roughly right: guessing wrong costs file size, never
 * correctness, because the black boxes are already drawn by this point.
 */
function looksPhotographic(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const step = Math.max(
    1,
    Math.floor(Math.sqrt((canvas.width * canvas.height) / SAMPLE_TARGET))
  );

  const colours = new Set<number>();
  try {
    for (let y = 0; y < canvas.height; y += step) {
      // One row-strip read per row keeps this to a few dozen getImageData calls
      // rather than one per pixel.
      const row = ctx.getImageData(0, y, canvas.width, 1).data;
      for (let x = 0; x < canvas.width; x += step) {
        const i = x * 4;
        colours.add((row[i] << 16) | (row[i + 1] << 8) | row[i + 2]);
        if (colours.size > PHOTO_UNIQUE_COLOURS) return true;
      }
    }
  } catch {
    // A tainted canvas can't be read. Nothing here is cross-origin, but if it
    // ever happens, PNG is the safe (larger, lossless) choice.
    return false;
  }

  return false;
}

export function pickEncoding(
  canvas: HTMLCanvasElement,
  looksScanned: boolean
): PageEncodingKind {
  if (looksScanned) return "jpeg";
  return looksPhotographic(canvas) ? "jpeg" : "png";
}

export async function encodePage(
  canvas: HTMLCanvasElement,
  kind: PageEncodingKind
): Promise<PageEncoding> {
  const mimeType = kind === "jpeg" ? "image/jpeg" : "image/png";
  const quality = kind === "jpeg" ? JPEG_QUALITY : undefined;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality)
  );
  if (!blob) throw new Error("Failed to rasterize page to an image");

  // A browser that can't produce the requested type silently substitutes PNG,
  // so trust the blob's own type over what we asked for — embedding JPEG bytes
  // via embedPng (or the reverse) produces a corrupt PDF.
  const actualKind: PageEncodingKind = blob.type === "image/jpeg" ? "jpeg" : "png";

  return {
    kind: actualKind,
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType: blob.type || mimeType,
  };
}
