import { AlertTriangle } from "lucide-react";
import type { RedactionWarning } from "../../hooks/useRedactionFunnel";

interface WarningPanelProps {
  warnings: readonly RedactionWarning[];
}

/**
 * Caveats about a redaction that the user genuinely needs, but which are not
 * failures: a page was read with OCR, an image had to be scaled down, a
 * right-to-left run was covered whole, the output got much larger.
 *
 * Styled as an advisory rather than an error — using the red error card for
 * these would train people to ignore it.
 */
export default function WarningPanel({ warnings }: WarningPanelProps) {
  if (warnings.length === 0) return null;

  // Several pages can raise the same warning; collapse them into one line with
  // the page numbers rather than repeating an identical sentence per page.
  const grouped = new Map<string, { detail: string; pages: number[] }>();
  for (const warning of warnings) {
    const existing = grouped.get(warning.code);
    const detail = warning.detail ?? warning.code;
    if (existing) {
      if (warning.page !== undefined) existing.pages.push(warning.page);
    } else {
      grouped.set(warning.code, {
        detail,
        pages: warning.page !== undefined ? [warning.page] : [],
      });
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-warn-500/30 bg-warn-500/5 px-5 py-4">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warn-400" strokeWidth={2} />
        <p className="text-sm font-medium text-ink-100">Worth knowing</p>
      </div>
      <ul className="mt-2.5 space-y-2 text-sm text-ink-300">
        {[...grouped.entries()].map(([code, { detail, pages }]) => (
          <li key={code} className="flex gap-2">
            <span aria-hidden="true" className="text-warn-400">
              •
            </span>
            <span>
              {pages.length > 1
                ? `${detail} (pages ${pages.join(", ")})`
                : detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
