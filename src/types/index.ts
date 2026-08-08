export type SupportedFileType =
  | "text/plain"
  | "text/csv"
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type UploadStatus = "idle" | "accepted" | "rejected";

export interface UploadedFile {
  file: File;
  id: string;
}

export type PIICategory =
  | "email"
  | "phone"
  | "creditCard"
  | "accountNumber"
  | "ssn"
  | "person"
  | "place"
  | "date"
  | "age";

export interface PIIMatch {
  category: PIICategory;
  start: number;
  end: number;
  text: string;
}

export interface RedactedItem {
  id: string;
  category: PIICategory;
  text: string;
  start: number;
  end: number;
}

export interface RedactionSummary {
  counts: Record<PIICategory, number>;
  total: number;
  items: RedactedItem[];
}

export interface RedactionResult {
  redactedText: string;
  summary: RedactionSummary;
  /**
   * The matches actually redacted, in ascending order. Returned alongside the
   * rendered text because callers that rebuild a structured format (CSV cells,
   * and later DOCX runs) need the spans, not a pre-joined string — and because
   * the review screen highlights them in place.
   */
  matches: PIIMatch[];
}

// Per-category redaction preference. When `exactValue` is set, it replaces
// algorithmic detection for that category with a literal (case-insensitive)
// search for that value — lets a user say "only remove this one name"
// instead of every name the detector finds.
export interface CategoryOption {
  enabled: boolean;
  exactValue: string;
}

export type RedactionOptions = Record<PIICategory, CategoryOption>;

export interface RedactionRequest {
  requestId: string;
  text: string;
  options?: RedactionOptions;
  excludedIds?: string[];
}

export type RedactionResponse =
  | { requestId: string; ok: true; result: RedactionResult }
  | { requestId: string; ok: false; error: string };
