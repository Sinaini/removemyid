import { Lock } from "lucide-react";
import type { RedactionSummary, ReplacementMode } from "../../types";
import {
  REPLACEMENT_MODE_HINTS,
  REPLACEMENT_MODE_LABELS,
} from "../../lib/redaction/pseudonym";

const MODES: ReplacementMode[] = ["redacted", "label", "pseudonym"];

interface ReplacementModePickerProps {
  mode: ReplacementMode;
  onChange: (mode: ReplacementMode) => void;
  /** The output is a flattened image, so the setting can't reach the file. */
  isRasterOutput: boolean;
  disabled?: boolean;
  summary: RedactionSummary | null;
}

/**
 * Lets the user choose how matched values are written out.
 *
 * For PDFs and images the control is locked rather than quietly ignored. Those
 * outputs are flattened rasters with solid black boxes drawn on them — there is
 * no text in the file to substitute — and a picker that appears to work but
 * changes nothing in the download would be worse than no picker at all.
 */
export default function ReplacementModePicker({
  mode,
  onChange,
  isRasterOutput,
  disabled = false,
  summary,
}: ReplacementModePickerProps) {
  // A live example built from a value actually found in this file, so the effect
  // of each mode is concrete rather than abstract.
  const example = summary?.items[0];

  return (
    <div className="mt-6 rounded-2xl border border-ink-800 bg-ink-900/40 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-ink-100">Replace values with</p>
        {isRasterOutput && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-xs text-ink-300">
            <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Not available for this file
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="Replacement style"
        className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:gap-2"
      >
        {MODES.map((option) => {
          const active = option === mode;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || isRasterOutput}
              onClick={() => onChange(option)}
              className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-signal-500 bg-signal-400/10 text-ink-50"
                  : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              }`}
            >
              <span className="block font-medium">
                {REPLACEMENT_MODE_LABELS[option]}
              </span>
              <span className="mt-0.5 block text-xs text-ink-400">
                {REPLACEMENT_MODE_HINTS[option]}
              </span>
            </button>
          );
        })}
      </div>

      {isRasterOutput ? (
        <p className="mt-3 text-xs text-ink-400">
          Your download is a flattened image, so redactions are solid black boxes
          — there's no text in the file to replace. That's also what makes image
          and PDF redaction impossible to undo.
        </p>
      ) : (
        example && (
          <p className="mt-3 font-mono text-xs text-ink-400">
            <span className="text-ink-300">{example.text}</span>
            <span className="mx-1.5 text-ink-600">→</span>
            <span className="text-signal-400">{example.replacement}</span>
          </p>
        )
      )}
    </div>
  );
}
