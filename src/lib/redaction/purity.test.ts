import { describe, it, expect } from "vitest";

// The detection pipeline runs in two places: a Web Worker (for text files) and
// the main thread (for PDF/image, where it needs canvas access for the boxes).
// So everything under src/lib/redaction and src/lib/pipeline must be DOM-free —
// a stray `document` reference works fine in dev on the main thread and then
// throws only inside the worker, which is the hardest place to notice it.
//
// vitest runs with environment: "node", so there is no `document` or `window`
// here at all. Importing each module therefore *is* the assertion: if any of
// them touches the DOM at module scope, the import throws.
const WORKER_SAFE_MODULES = [
  "./registry",
  "./patterns",
  "./nlp",
  "./options",
  "./redact",
  "../pipeline/offsetMap",
  "../pipeline/abort",
];

describe("worker-safe modules are DOM-free", () => {
  it("has no DOM globals in this environment (guards the test itself)", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  for (const path of WORKER_SAFE_MODULES) {
    it(`imports ${path} without a DOM`, async () => {
      const module = await import(path);
      expect(module).toBeTruthy();
    });
  }
});
