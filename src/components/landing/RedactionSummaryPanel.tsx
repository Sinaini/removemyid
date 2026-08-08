import { Download, Eye, EyeOff, RotateCcw, ShieldCheck } from "lucide-react";
import type { RedactionSummary, PIICategory, RedactedItem } from "../../types";
import { CATEGORY_META, CATEGORY_ORDER, categoryLabel } from "../../lib/redaction/categoryMeta";

interface RedactionSummaryPanelProps {
  summary: RedactionSummary;
  isUpdating: boolean;
  /**
   * True when regenerating after an exclusion failed, so the blob we hold no
   * longer matches the list on screen. The download must be blocked rather than
   * silently handing over a mismatched file.
   */
  staleOutput?: boolean;
  onDownload: () => void;
  onPreview: () => void;
  onReset: () => void;
  onRemoveItem: (id: string) => void;
  onRetry?: () => void;
}

function groupItems(items: RedactedItem[]): Partial<Record<PIICategory, RedactedItem[]>> {
  const grouped: Partial<Record<PIICategory, RedactedItem[]>> = {};
  for (const item of items) {
    (grouped[item.category] ??= []).push(item);
  }
  return grouped;
}

export default function RedactionSummaryPanel({
  summary,
  isUpdating,
  staleOutput = false,
  onDownload,
  onPreview,
  onReset,
  onRemoveItem,
  onRetry,
}: RedactionSummaryPanelProps) {
  const actionsDisabled = isUpdating || staleOutput;
  const grouped = groupItems(summary.items.filter((item) => !item.kept));
  const keptItems = summary.items.filter((item) => item.kept);
  const categories = CATEGORY_ORDER.filter((category) => summary.counts[category] > 0);

  return (
    <>
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
              {isUpdating
                ? "Updating…"
                : "Here's exactly what was replaced. Remove an item to keep it un-redacted."}
            </p>
          </div>
        </div>

        {staleOutput && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-danger-500/40 bg-danger-500/5 px-4 py-3"
          >
            <p className="text-sm text-ink-100">
              That change couldn't be applied, so the file below no longer matches
              this list. Downloading is disabled until it's rebuilt.
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:bg-ink-800 hover:text-ink-50"
              >
                Rebuild the file
              </button>
            )}
          </div>
        )}

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
                  <ul className="mt-2 ml-6 max-h-40 space-y-3 overflow-y-auto pr-1">
                    {values.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 truncate font-mono text-xs text-ink-400"
                      >
                        <span className="truncate text-ink-300">{item.text}</span>
                        <span className="shrink-0 text-ink-600">→</span>
                        <span className="shrink-0 text-signal-400">{item.replacement}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          disabled={actionsDisabled}
                          aria-label={`Keep ${item.text} visible`}
                          title="Keep this un-redacted"
                          className="ml-auto shrink-0 rounded p-0.5 text-ink-500 transition hover:bg-ink-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {keptItems.length > 0 && (
          // Kept values are listed separately rather than dropped, so the
          // decision stays visible and reversible — and so it is obvious that
          // these are still in the downloaded file.
          <div className="mt-5 border-t border-ink-800 pt-4">
            <div className="flex items-center gap-2.5 text-sm">
              <EyeOff className="h-4 w-4 text-warn-400" strokeWidth={2} />
              <span className="font-medium text-ink-200">Kept visible</span>
              <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-medium text-ink-300">
                {keptItems.length}
              </span>
            </div>
            <ul className="mt-2 ml-6 space-y-2">
              {keptItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 font-mono text-xs text-ink-400"
                >
                  <span className="break-all text-ink-300 line-clamp-2">
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    disabled={actionsDisabled}
                    aria-label={`Redact ${item.text} after all`}
                    className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-50 disabled:opacity-40"
                  >
                    Redact
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={onPreview}
            disabled={actionsDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-ink-300 transition hover:bg-ink-800 hover:text-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="h-4 w-4" strokeWidth={2} />
            Preview
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={actionsDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-signal-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            Download redacted file
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-ink-400 transition hover:bg-ink-800 hover:text-ink-50"
      >
        <RotateCcw className="h-4 w-4" strokeWidth={2} />
        Redact another file
      </button>
    </>
  );
}
