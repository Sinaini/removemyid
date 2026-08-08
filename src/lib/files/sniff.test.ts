import { describe, it, expect } from "vitest";
import { sniffFile, extensionOf, type SniffResult } from "./sniff";

/** A File whose bytes and reported MIME type we control independently. */
function file(name: string, bytes: number[] | string, type = ""): File {
  const data =
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  return new File([data], name, { type });
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00];

async function sniff(f: File) {
  return sniffFile(f);
}

function expectSupported(result: Awaited<ReturnType<typeof sniff>>): SniffResult {
  if (result.kind !== "supported") throw new Error(`rejected: ${result.detail}`);
  return result;
}

describe("extensionOf", () => {
  it("returns the lowercased extension", () => {
    expect(extensionOf("Report.PDF")).toBe("pdf");
  });

  it("returns empty for a dotfile or a name with no dot", () => {
    expect(extensionOf(".env")).toBe("");
    expect(extensionOf("README")).toBe("");
  });
});

describe("sniffFile — magic bytes win", () => {
  it("identifies a PDF", async () => {
    const result = expectSupported(await sniff(file("x.pdf", PDF, "application/pdf")));
    expect(result.formatId).toBe("pdf");
    expect(result.confidence).toBe("magic");
  });

  // The bug: dispatch keyed on MIME, so a PDF whose type was empty or wrong fell
  // into the text path and came back as a corrupt ".pdf" full of mojibake.
  it("identifies a PDF despite a lying extension and empty MIME type", async () => {
    const result = expectSupported(await sniff(file("report.txt", PDF, "")));
    expect(result.formatId).toBe("pdf");
  });

  it("identifies JPEG and PNG", async () => {
    expect(expectSupported(await sniff(file("a.jpg", JPEG))).mimeType).toBe("image/jpeg");
    expect(expectSupported(await sniff(file("a.png", PNG))).mimeType).toBe("image/png");
  });

  it("identifies WEBP by its RIFF container", async () => {
    const webp = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
    expect(expectSupported(await sniff(file("a.webp", webp))).mimeType).toBe("image/webp");
  });
});

describe("sniffFile — rejections", () => {
  it("rejects an empty file", async () => {
    const result = await sniff(file("empty.txt", []));
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.reason).toBe("empty");
  });

  // This single rule is what stops arbitrary binary being decoded as UTF-8 and
  // handed back as a "redacted" corrupt file.
  it("rejects unknown binary rather than decoding it as text", async () => {
    const result = await sniff(file("mystery.bin", [0x01, 0x00, 0x02, 0x00, 0xff]));
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.reason).toBe("binary-unknown");
  });

  it("rejects a zip container and names the likely format", async () => {
    const result = await sniff(file("notes.docx", ZIP));
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reason).toBe("zip-unsupported");
      expect(result.detail).toContain("Word");
    }
  });

  it("names xlsx specifically too", async () => {
    const result = await sniff(file("data.xlsx", ZIP));
    if (result.kind === "rejected") expect(result.detail).toContain("Excel");
  });

  it("does not reject UTF-16 text for containing NUL bytes", async () => {
    // "ab" in UTF-16LE with a BOM.
    const utf16 = [0xff, 0xfe, 0x61, 0x00, 0x62, 0x00];
    expect(expectSupported(await sniff(file("a.txt", utf16))).formatId).toBe("text");
  });
});

describe("sniffFile — extension beats MIME", () => {
  // Excel on Windows reports .csv as application/vnd.ms-excel, which the old
  // MIME-first dispatch could not route correctly.
  it("routes a .csv reported as an Excel type to the CSV handler", async () => {
    const result = expectSupported(
      await sniff(file("data.csv", "a,b\n1,2", "application/vnd.ms-excel"))
    );
    expect(result.formatId).toBe("csv");
    expect(result.confidence).toBe("extension");
  });

  it("routes .json, .md and .html by extension", async () => {
    expect(expectSupported(await sniff(file("a.json", "{}"))).formatId).toBe("json");
    expect(expectSupported(await sniff(file("a.md", "# hi"))).formatId).toBe("markdown");
    expect(expectSupported(await sniff(file("a.html", "<p>hi</p>"))).formatId).toBe("html");
  });
});

describe("sniffFile — content shape", () => {
  it("recognises HTML with no useful extension", async () => {
    const result = expectSupported(
      await sniff(file("page", "<!DOCTYPE html><html><body>hi</body></html>"))
    );
    expect(result.formatId).toBe("html");
    expect(result.confidence).toBe("content");
  });

  it("recognises JSON with no useful extension", async () => {
    expect(expectSupported(await sniff(file("blob", '{"a":1}'))).formatId).toBe("json");
  });

  it("recognises delimited data with a consistent field count", async () => {
    const result = expectSupported(await sniff(file("export", "a,b,c\n1,2,3\n4,5,6")));
    expect(result.formatId).toBe("csv");
  });

  it("does not mistake prose containing commas for a spreadsheet", async () => {
    const prose =
      "Hello, world.\nThis sentence, unlike the last, has two commas in it.\nAnd this one has none.";
    expect(expectSupported(await sniff(file("notes", prose))).formatId).toBe("text");
  });

  it("falls back to plain text", async () => {
    expect(expectSupported(await sniff(file("notes", "just some words"))).formatId).toBe(
      "text"
    );
  });
});
