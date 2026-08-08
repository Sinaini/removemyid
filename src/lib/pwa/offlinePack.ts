// Making the app genuinely usable offline.
//
// The service worker precaches the app shell, but the pdf.js worker and the OCR
// engine are deliberately left out: together they are tens of megabytes and most
// visitors never touch OCR. They are runtime-cached instead, which means they
// only land in the cache after a first *online* PDF or image redaction.
//
// The consequence is a gap the app never mentioned: load the page, go offline
// immediately, try a PDF, and you get an opaque fetch failure. This module lets
// the user deliberately download those assets ahead of time, and lets the UI say
// what is and isn't available.
//
// Everything here fetches from the app's own origin, so it does not weaken the
// "nothing leaves your browser" guarantee — see CONTRIBUTING.md.

export type OcrLang = "eng" | "heb" | "spa" | "fra" | "deu";

export interface PackAsset {
  url: string;
  label: string;
  /** Approximate size, for showing a download total before committing. */
  bytes: number;
  group: "pdf" | "ocr-core" | "ocr-lang";
}

export interface PackStatus {
  assets: Array<PackAsset & { cached: boolean }>;
  totalBytes: number;
  cachedBytes: number;
  ready: boolean;
}

export const LANG_LABELS: Record<OcrLang, string> = {
  eng: "English",
  heb: "Hebrew",
  spa: "Spanish",
  fra: "French",
  deu: "German",
};

const LANG_BYTES: Record<OcrLang, number> = {
  eng: 2_950_000,
  heb: 581_000,
  spa: 2_100_000,
  fra: 707_000,
  deu: 1_330_000,
};

/**
 * tesseract.js ships three mutually exclusive WASM cores and feature-detects one
 * at runtime. Warming all three would download ~11.7MB to use ~3.9MB, so mirror
 * its detection order and warm only the one that will actually be loaded.
 */
export function selectOcrCore(): string {
  const base = "/tesseract/core";
  if (hasRelaxedSimd()) return `${base}/tesseract-core-relaxedsimd-lstm.wasm.js`;
  if (hasSimd()) return `${base}/tesseract-core-simd-lstm.wasm.js`;
  return `${base}/tesseract-core-lstm.wasm.js`;
}

// Minimal valid WebAssembly modules using the feature in question. `validate`
// returns false rather than throwing when the feature is missing.
function hasSimd(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
        8, 0, 65, 0, 253, 15, 253, 98, 11,
      ])
    );
  } catch {
    return false;
  }
}

function hasRelaxedSimd(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1,
        13, 0, 65, 0, 253, 15, 65, 0, 253, 15, 253, 128, 2, 11,
      ])
    );
  } catch {
    return false;
  }
}

/**
 * The pdf.js worker URL is content-hashed at build time, so it cannot be
 * hardcoded. Importing the same `?url` specifier the PDF path uses gives the
 * exact URL the service worker's runtime-cache rule matches.
 */
async function pdfWorkerUrl(): Promise<string> {
  const module = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  return module.default;
}

export async function packAssets(langs: readonly OcrLang[]): Promise<PackAsset[]> {
  const assets: PackAsset[] = [
    {
      url: await pdfWorkerUrl(),
      label: "PDF engine",
      bytes: 1_310_000,
      group: "pdf",
    },
    {
      url: "/tesseract/worker.min.js",
      label: "Text recognition worker",
      bytes: 111_000,
      group: "ocr-core",
    },
    {
      url: selectOcrCore(),
      label: "Text recognition engine",
      bytes: 3_900_000,
      group: "ocr-core",
    },
  ];

  for (const lang of langs) {
    assets.push({
      url: `/tessdata/${lang}.traineddata.gz`,
      label: `${LANG_LABELS[lang]} language data`,
      bytes: LANG_BYTES[lang],
      group: "ocr-lang",
    });
  }

  return assets;
}

/** Whether each asset is already in a cache, without downloading anything. */
export async function checkOfflinePack(
  langs: readonly OcrLang[]
): Promise<PackStatus> {
  const assets = await packAssets(langs);

  if (typeof caches === "undefined") {
    return emptyStatus(assets);
  }

  const withState = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      cached: Boolean(await caches.match(asset.url)),
    }))
  );

  const totalBytes = withState.reduce((sum, a) => sum + a.bytes, 0);
  const cachedBytes = withState
    .filter((a) => a.cached)
    .reduce((sum, a) => sum + a.bytes, 0);

  return {
    assets: withState,
    totalBytes,
    cachedBytes,
    ready: withState.every((a) => a.cached),
  };
}

function emptyStatus(assets: PackAsset[]): PackStatus {
  const withState = assets.map((asset) => ({ ...asset, cached: false }));
  return {
    assets: withState,
    totalBytes: withState.reduce((sum, a) => sum + a.bytes, 0),
    cachedBytes: 0,
    ready: false,
  };
}

/**
 * Fetch each asset so the service worker's existing CacheFirst rules store it.
 * No service-worker changes are needed — the rules already match these URLs;
 * they just had nothing to cache until the first use.
 */
export async function warmOfflinePack(
  langs: readonly OcrLang[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const assets = await packAssets(langs);
  let done = 0;

  onProgress(0, assets.length);

  for (const asset of assets) {
    if (signal?.aborted) return;
    try {
      // cache: "reload" bypasses the HTTP cache but still passes through the
      // service worker, which is what actually stores it.
      await fetch(asset.url, { cache: "reload", signal });
    } catch {
      // One failed asset shouldn't abandon the rest; the status check
      // afterwards reports honestly what did and didn't land.
    }
    done += 1;
    onProgress(done, assets.length);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
