import type { RedactionResult } from "../../types";

export interface ProcessedFile {
  blob: Blob;
  filename: string;
  summary: RedactionResult["summary"];
}

export async function redactTextFile(
  file: File,
  redact: (text: string) => Promise<RedactionResult>
): Promise<ProcessedFile> {
  const text = await file.text();
  const { redactedText, summary } = await redact(text);
  const mimeType = file.type || "text/plain";
  const blob = new Blob([redactedText], { type: mimeType });

  return { blob, filename: file.name, summary };
}
