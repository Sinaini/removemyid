import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// pdf.js's `PDFPageProxy.getTextContent()` does `for await (const value of
// readableStream)`, which requires `ReadableStream.prototype[Symbol.asyncIterator]`.
// That's a Web Streams API feature, not a JS-language one, so it isn't covered
// by any JS polyfill (including the "legacy" pdf.js build's core-js bundle).
// WebKit/iOS Safari shipped `ReadableStream` well before it shipped async
// iteration for it, and Chrome-on-iOS inherits the same gap since it also
// runs on WebKit — so on those browsers the missing method gets called as a
// function and throws "undefined is not a function". Polyfill it directly.
if (
  typeof ReadableStream !== "undefined" &&
  !ReadableStream.prototype[Symbol.asyncIterator]
) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* (
    this: ReadableStream
  ): AsyncGenerator<unknown, undefined, unknown> {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

// The non-legacy build assumes the latest JS engine features and can throw
// cryptic errors (e.g. "undefined is not a function" deep in font/stream
// parsing) on older mobile browsers. The legacy build targets environments
// without full support for the newest JavaScript features.
GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
