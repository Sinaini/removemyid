import { Download, Eye, RotateCcw, ShieldCheck } from "lucide-react";
import type { RedactionSummary, PIICategory, RedactedItem } from "../../types";
import { CATEGORY_META, CATEGORY_ORDER, categoryLabel } from "../../lib/redaction/categoryMeta";

interface RedactionSummaryPanelProps {
  summary: RedactionSummary;
  onDownload: () => void;
  onPreview: () => void;
  onReset: () => void;
}

function groupItems(items: RedactedItem[]): Partial<Record<PIICategory, string[]>> {
  const grouped: Partial<Record<PIICategory, string[]>> = {};
  for (const item of items) {
    (grouped[item.category] ??= []).push(item.text);
  }
  return grouped;
}

export default function RedactionSummaryPanel({
  summary,
  onDownload,
  onPreview,
  onReset,
}: RedactionSummaryPanelProps) {
  const grouped = groupItems(summary.items);
  const categories = CATEGORY_ORDER.filter((category) => summary.counts[category] > 0);

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal-400/15 text-signal-400">
          <ShieldCheck className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-50">
            Found {summary.total} item{summary.total === 1 ? "" : "s"} to redact
          </p>
          <p className="text-xs text-ink-400">
            Here's exactly what was replaced with [REDACTED]
          </p>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mt-5 space-y-4 border-t border-ink-800 pt-4">
          {categories.map((category) => {
            const Icon = CATEGORY_META[category].icon;
            const count = summary.counts[category];
            const values = grouped[category] ?? [];

            return (
              <div key={category}>
                <div className="flex items-center gap-2.5 text-sm">
                  <Icon className="h-4 w-4 text-ink-400" strokeWidth={2} />
                  <span className="font-medium text-ink-200">
                    {categoryLabel(category, count)}
                  </span>
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-medium text-ink-300">
                    {count}
                  </span>
                </div>
                <ul className="mt-2 ml-6 max-h-40 space-y-1 overflow-y-auto pr-1">
                  {values.map((value, i) => (
                    <li
                      key={`${value}-${i}`}
                      className="flex items-center gap-2 truncate font-mono text-xs text-ink-400"
                    >
                      <span className="truncate text-ink-300">{value}</span>
                      <span className="shrink-0 text-ink-600">→</span>
                      <span className="shrink-0 text-signal-400">[REDACTED]</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onDownload}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-signal-500 px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            Download redacted file
          </button>
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center justify-center gap-2 rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-medium text-ink-300 transition hover:bg-ink-800 hover:text-ink-50"
          >
            <Eye className="h-4 w-4" strokeWidth={2} />
            Preview
          </button>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-ink-400 transition hover:bg-ink-800 hover:text-ink-50"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={2} />
          Redact another file
        </button>
      </div>
    </div>
  );
}
