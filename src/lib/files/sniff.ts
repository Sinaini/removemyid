// Deciding what a file actually is.
//
// The previous dispatch keyed on `file.type` with a catch-all `else` that
// decoded anything remaining as UTF-8 text. That misroutes several real cases:
// Windows reports a .csv as `application/vnd.ms-excel`, drag-and-drop sometimes
// supplies an empty `type`, and a PDF arriving with no type at all was decoded
// as mojibake and handed back as a corrupt ".pdf".
//
// So: magic bytes first, then extension, then content shape, and only then the
// browser's guess. And crucially, an unrecognised *binary* file is rejected
// rather than being fed to the text path.

export type FormatId = "text" | "csv" | "json" | "markdown" | "html" | "pdf" | "image";

export type SniffConfidence = "magic" | "extension" | "content" | "mime";

export interface SniffResult {
  kind: "supported";
  formatId: FormatId;
  mimeType: string;
  confidence: SniffConfidence;
}

export interface SniffRejection {
  kind: "rejected";
  reason: "binary-unknown" | "zip-unsupported" | "empty";
  detail: string;
}

const HEADER_BYTES = 4096;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < Math.min(bytes.length, offset + length); i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

const TEXT_EXTENSIONS: Record<string, { formatId: FormatId; mimeType: string }> = {
  txt: { formatId: "text", mimeType: "text/plain" },
  text: { formatId: "text", mimeType: "text/plain" },
  log: { formatId: "text", mimeType: "text/plain" },
  csv: { formatId: "csv", mimeType: "text/csv" },
  tsv: { formatId: "csv", mimeType: "text/tab-separated-values" },
  json: { formatId: "json", mimeType: "application/json" },
  md: { formatId: "markdown", mimeType: "text/markdown" },
  markdown: { formatId: "markdown", mimeType: "text/markdown" },
  html: { formatId: "html", mimeType: "text/html" },
  htm: { formatId: "html", mimeType: "text/html" },
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export async function sniffFile(file: File): Promise<SniffResult | SniffRejection> {
  if (file.size === 0) {
    return { kind: "rejected", reason: "empty", detail: "That file is empty." };
  }

  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());

  // 1. Magic bytes — the only fully trustworthy signal.
  if (startsWith(header, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return supported("pdf", "application/pdf", "magic");
  }
  if (startsWith(header, [0xff, 0xd8, 0xff])) {
    return supported("image", "image/jpeg", "magic");
  }
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return supported("image", "image/png", "magic");
  }
  if (ascii(header, 0, 4) === "RIFF" && ascii(header, 8, 4) === "WEBP") {
    return supported("image", "image/webp", "magic");
  }
  if (startsWith(header, [0x47, 0x49, 0x46, 0x38])) {
    return supported("image", "image/gif", "magic");
  }

  // A zip container. Office formats live in here; none are supported yet, so say
  // which one it looks like rather than failing opaquely.
  if (startsWith(header, [0x50, 0x4b, 0x03, 0x04])) {
    return { kind: "rejected", reason: "zip-unsupported", detail: describeZip(file) };
  }

  // 2. A NUL byte in the header means binary. This single rule is what stops
  // arbitrary binary reaching the UTF-8 text path and being returned as a
  // corrupt file that claims to have been redacted.
  if (header.includes(0x00) && !looksUtf16(header)) {
    return {
      kind: "rejected",
      reason: "binary-unknown",
      detail:
        "That looks like a binary file in a format this tool doesn't read. Supported: .txt, .csv, .json, .md, .html, .pdf, .jpg, .png, .webp.",
    };
  }

  // 3. Extension — reliable for text formats, and the fix for Excel reporting a
  // .csv as application/vnd.ms-excel.
  const byExtension = TEXT_EXTENSIONS[extensionOf(file.name)];
  if (byExtension) {
    return supported(byExtension.formatId, byExtension.mimeType, "extension");
  }

  // 4. Content shape, for files with a missing or meaningless extension.
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(header)
    .replace(/^﻿/, "")
    .trimStart();

  if (/^<!doctype html/i.test(sample) || /^<html[\s>]/i.test(sample)) {
    return supported("html", "text/html", "content");
  }
  if (sample.startsWith("{") || sample.startsWith("[")) {
    return supported("json", "application/json", "content");
  }
  if (looksDelimited(sample)) {
    return supported("csv", "text/csv", "content");
  }

  // 5. The browser's guess, last.
  if (file.type === "text/csv") return supported("csv", "text/csv", "mime");
  if (file.type === "application/json") return supported("json", "application/json", "mime");
  if (file.type.startsWith("image/")) return supported("image", file.type, "mime");

  return supported("text", file.type || "text/plain", "mime");
}

function supported(
  formatId: FormatId,
  mimeType: string,
  confidence: SniffConfidence
): SniffResult {
  return { kind: "supported", formatId, mimeType, confidence };
}

const ZIP_FORMATS: Record<string, string> = {
  docx: "Word documents",
  xlsx: "Excel spreadsheets",
  pptx: "PowerPoint decks",
  odt: "OpenDocument text files",
  ods: "OpenDocument spreadsheets",
  zip: "zip archives",
};

function describeZip(file: File): string {
  const named = ZIP_FORMATS[extensionOf(file.name)];
  return named
    ? `${named} aren't supported yet. Save it as a PDF or plain text and try again.`
    : "That looks like a zip archive or an Office document, which isn't supported yet.";
}

/** UTF-16 text is full of NUL bytes but is still text, so don't reject it. */
function looksUtf16(header: Uint8Array): boolean {
  return (
    startsWith(header, [0xff, 0xfe]) ||
    startsWith(header, [0xfe, 0xff]) ||
    // No BOM, but every other byte is NUL: UTF-16 ASCII-range text.
    (header.length >= 8 &&
      header[1] === 0x00 &&
      header[3] === 0x00 &&
      header[5] === 0x00 &&
      header[0] !== 0x00)
  );
}

/**
 * Does the sample look like delimited data? Requires a consistent field count
 * across several rows, so ordinary prose containing commas isn't mistaken for a
 * spreadsheet.
 */
function looksDelimited(sample: string): boolean {
  const lines = sample.split(/\r?\n/).filter((line) => line.length > 0).slice(0, 6);
  if (lines.length < 2) return false;

  for (const delimiter of [",", ";", "\t", "|"]) {
    const counts = lines.map((line) => line.split(delimiter).length);
    if (counts[0] >= 2 && counts.every((count) => count === counts[0])) return true;
  }
  return false;
}
