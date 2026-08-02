import * as Tesseract from "tesseract.js";

// Self-hosted so OCR keeps working after the initial page load — without
// these, tesseract.js falls back to fetching its worker/core/language files
// from a CDN on first use.
const WORKER_PATH = "/tesseract/worker.min.js";
const CORE_PATH = "/tesseract/core";
const LANG_PATH = "/tessdata";

// Recognized together as one combined model — traineddata for each of these
// must exist under public/tessdata/<code>.traineddata.gz.
const LANGS = ["eng", "heb", "spa", "fra", "deu"];

let workerPromise: Promise<Tesseract.Worker> | null = null;

// One worker is created lazily and reused for the rest of the session —
// spinning up a new one means re-loading the WASM core and language data,
// which is the slow part of OCR.
export function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(LANGS, Tesseract.OEM.LSTM_ONLY, {
      workerPath: WORKER_PATH,
      corePath: CORE_PATH,
      langPath: LANG_PATH,
    });
  }
  return workerPromise;
}
