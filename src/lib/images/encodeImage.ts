export interface EncodedImage {
  blob: Blob;
  mimeType: string;
  /** File extension matching the actual bytes, without a dot. */
  extension: string;
  /** True when the browser could not honour the requested format. */
  substituted: boolean;
}

const JPEG_QUALITY = 0.92;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Encode a canvas, then check what actually came back.
 *
 * `canvas.toBlob(cb, "image/webp")` on a browser without a WebP encoder does
 * not fail — it silently produces PNG bytes. The previous code kept the
 * original `.webp` filename, so the user downloaded a file whose extension lied
 * about its contents and which some tools then refused to open.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  preferredMime: string
): Promise<EncodedImage> {
  const requested = preferredMime || "image/png";
  const quality = requested === "image/jpeg" ? JPEG_QUALITY : undefined;

  let blob = await toBlob(canvas, requested, quality);

  // Nothing came back at all: fall back to PNG, which every canvas
  // implementation supports.
  if (!blob) {
    blob = await toBlob(canvas, "image/png");
    if (!blob) throw new Error("Failed to encode the redacted image");
  }

  const actualMime = blob.type || "image/png";
  return {
    blob,
    mimeType: actualMime,
    extension: EXTENSIONS[actualMime] ?? "png",
    substituted: actualMime !== requested,
  };
}

function toBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}
