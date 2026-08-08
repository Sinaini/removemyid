import { describe, it, expect } from "vitest";
import { outputFilename, withRedactedSuffix } from "./download";

describe("outputFilename", () => {
  it("inserts the suffix before the extension", () => {
    expect(outputFilename("report.pdf")).toBe("report-redacted.pdf");
  });

  it("handles a name with no extension", () => {
    expect(outputFilename("report")).toBe("report-redacted");
  });

  it("treats a leading dot as part of the name, not an extension", () => {
    expect(outputFilename(".env")).toBe(".env-redacted");
  });

  it("uses the last dot when there are several", () => {
    expect(outputFilename("lab.report.v2.pdf")).toBe("lab.report.v2-redacted.pdf");
  });

  // The .webp-encoded-as-PNG case: the filename must describe the real bytes.
  it("overrides the extension when the output format changed", () => {
    expect(outputFilename("photo.webp", "png")).toBe("photo-redacted.png");
  });

  it("keeps withRedactedSuffix behaviour for existing callers", () => {
    expect(withRedactedSuffix("notes.txt")).toBe("notes-redacted.txt");
  });
});
