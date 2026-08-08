// Revoking an object URL in the same tick as the synthetic click() races the
// browser's own fetch of that URL. Chrome tolerates it; Safari and some
// Firefox versions have not started reading the blob yet and produce a
// zero-byte or failed download. A generous delayed revoke costs nothing (the
// blob is freed either way once the tab closes) and removes the race entirely.
const REVOKE_DELAY_MS = 60_000;

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export interface PreviewHandle {
  url: string;
  revoke(): void;
}

// Preview URLs outlive the click that made them (the user is reading the file
// in another tab), so they can't be revoked on a timer — the caller holds the
// handle and revokes when it opens the next preview or unmounts. Without that,
// every Preview click leaked a blob for the life of the session.
export function openBlobPreview(blob: Blob, mimeType?: string): PreviewHandle {
  const previewBlob = previewableBlob(blob, mimeType ?? blob.type);
  const url = URL.createObjectURL(previewBlob);
  window.open(url, "_blank", "noopener,noreferrer");

  let revoked = false;
  return {
    url,
    revoke() {
      if (revoked) return;
      revoked = true;
      URL.revokeObjectURL(url);
    },
  };
}

// Text-ish types are re-typed as text/plain purely for preview, because a
// browser handed a text/csv or application/json blob URL downloads it instead
// of rendering it — which makes the Preview button do the same thing as
// Download.
const TEXT_PREVIEW_TYPES = new Set([
  "text/csv",
  "text/tab-separated-values",
  "text/markdown",
  "application/json",
  "text/html",
  "application/xml",
  "text/xml",
]);

function previewableBlob(blob: Blob, mimeType: string): Blob {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!TEXT_PREVIEW_TYPES.has(base)) return blob;

  // Note text/html is deliberately included above. A text/html blob URL runs
  // its scripts in an opaque origin, so previewing a user's own HTML file that
  // way would execute whatever is in it — a pointless XSS surface in a
  // privacy tool. Showing the redacted source as plain text is both safer and
  // more useful for checking a redaction.
  return new Blob([blob], { type: "text/plain;charset=utf-8" });
}

/**
 * `report.pdf` -> `report-redacted.pdf`. Pass `extension` (without a dot) when
 * the output format differs from the input — e.g. a .webp the browser could
 * only re-encode as PNG, where keeping the original extension would produce a
 * file whose name lies about its bytes.
 */
export function outputFilename(originalName: string, extension?: string): string {
  const dotIndex = originalName.lastIndexOf(".");
  const stem = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
  const currentExt = dotIndex > 0 ? originalName.slice(dotIndex + 1) : "";
  const ext = extension ?? currentExt;

  return ext ? `${stem}-redacted.${ext}` : `${stem}-redacted`;
}

/** Retained for existing callers; `outputFilename` is the fuller form. */
export function withRedactedSuffix(filename: string): string {
  return outputFilename(filename);
}
