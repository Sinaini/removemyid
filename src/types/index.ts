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
  | "url"
  | "creditCard"
  | "iban"
  | "routingNumber"
  | "accountNumber"
  | "ssn"
  | "nationalId"
  | "passport"
  | "driversLicence"
  | "secret"
  | "ipAddress"
  | "macAddress"
  | "person"
  | "place"
  | "postalCode"
  | "date"
  | "age"
  // User-authored, not detected. Kept in the same union so manual redactions
  // flow through the existing summary, counting and rendering machinery instead
  // of needing a parallel path.
  | "manual";

/**
 * A span the user marked for redaction themselves, because a detector missed it.
 *
 * `id` comes from `generateId()` at creation, deliberately NOT derived from the
 * offsets: the pipeline re-runs on every change, and an offset-derived id would
 * break the moment anything shifted.
 */
export interface ManualSpan {
  id: string;
  /** 0 for text and images; the 1-based page for PDFs. */
  page: number;
  start: number;
  end: number;
  /** The exact text selected, re-validated on each run. */
  text: string;
  /** Redact just this occurrence, or every occurrence of the same text. */
  scope: "occurrence" | "all";
}

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
  /**
   * The exact string written into the output in place of `text`. Stored rather
   * than recomputed for display, so the results list physically cannot disagree
   * with the file the user downloads.
   */
  replacement: string;
  /**
   * True when the user chose to leave this occurrence visible.
   *
   * Kept items stay in `items` rather than being filtered out, which is what
   * makes un-redacting reversible: the highlight remains on screen, marked as
   * kept, so it can be clicked again. Removing them from the list made the
   * action one-way, since there was then nothing left to click.
   *
   * They are excluded from `counts` and `total`, which report what was actually
   * redacted.
   */
  kept?: boolean;
}

/**
 * How a matched value is rendered in the output.
 *
 * - `redacted`   — the literal `[REDACTED]`. The default, and the safest.
 * - `label`      — the category, e.g. `[EMAIL]`, `[NAME]`. Keeps the shape of the
 *                  document readable without revealing anything.
 * - `pseudonym`  — a stable per-value token, e.g. `[PERSON_1]`. The same value
 *                  always maps to the same token within one file, so a redacted
 *                  dataset stays analysable and joinable.
 */
export type ReplacementMode = "redacted" | "label" | "pseudonym";

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
  replacementMode?: ReplacementMode;
  manualSpans?: ManualSpan[];
}

export type RedactionResponse =
  | { requestId: string; ok: true; result: RedactionResult }
  | { requestId: string; ok: false; error: string };
