import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// The non-legacy build assumes the latest JS engine features and can throw
// cryptic errors (e.g. "undefined is not a function" deep in font/stream
// parsing) on older mobile browsers. The legacy build targets environments
// without full support for the newest JavaScript features.
GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
