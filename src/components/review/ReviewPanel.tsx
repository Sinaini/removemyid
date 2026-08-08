import { useMemo, useRef, useState } from "react";
import { Highlighter, Info, X } from "lucide-react";
import type { ManualSpan, RedactionSummary } from "../../types";
import { CATEGORY_DEFS, type CategoryGroup } from "../../lib/redaction/registry";
import { buildSegments } from "../../lib/review/segments";

// Written out in full rather than composed as `bg-cat-${group}/25`. Tailwind
// scans source text for class names, so a name assembled at runtime is never
// generated and the highlight silently loses its background.
//
// Colour is by group, not by category: nineteen distinguishable, accessible hues
// do not exist. The category is carried by the accessible name instead, so the
// meaning never depends on colour alone.
const GROUP_HIGHLIGHT: Record<CategoryGroup, string> = {
  contact: "bg-cat-contact/25 decoration-cat-contact",
  financial: "bg-cat-financial/25 decoration-cat-financial",
  identifier: "bg-cat-identifier/25 decoration-cat-identifier",
  location: "bg-cat-location/25 decoration-cat-location",
  other: "bg-cat-other/25 decoration-cat-other",
};

interface ReviewPanelProps {
  text: string;
  summary: RedactionSummary;
  manualSpans: readonly ManualSpan[];
  isUpdating: boolean;
  onToggleItem: (id: string) => void;
  onAddManual: (span: Omit<ManualSpan, "id">) => void;
  onRemoveManual: (id: string) => void;
}

interface PendingSelection {
  start: number;
  end: number;
  text: string;
  occurrences: number;
}

/**
 * The document, with every match highlighted in place.
 *
 * This exists to close the tool's biggest gap: the results list could only ever
 * *remove* a redaction. If a detector missed something — and heuristic detection
 * always will — the user had no way to redact it, which for a redaction tool is
 * the failure that matters. Selecting text here and choosing "Redact" is that
 * missing path.
 */
export default function ReviewPanel({
  text,
  summary,
  manualSpans,
  isUpdating,
  onToggleItem,
  onAddManual,
  onRemoveManual,
}: ReviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);

  // Recomputed only when the item set or the text changes, not on every render.
  const segments = useMemo(
    () => buildSegments(text, summary.items),
    [text, summary.items]
  );

  const readSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      setPending(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const start = offsetOf(range.startContainer, range.startOffset);
    const end = offsetOf(range.endContainer, range.endOffset);
    if (start === null || end === null || end <= start) {
      setPending(null);
      return;
    }

    const selected = text.slice(start, end);
    if (!selected.trim()) {
      setPending(null);
      return;
    }

    setPending({
      start,
      end,
      text: selected,
      // Counted up front so "redact all" is never a blind action — the button
      // says how many places it will affect before it is pressed.
      occurrences: countOccurrences(text, selected),
    });
  };

  /**
   * Map a DOM position back to an offset in the source text. Every rendered span
   * carries its own start offset, so this is a lookup plus the offset within
   * that span rather than a walk of the whole tree.
   */
  const offsetOf = (node: Node, offsetInNode: number): number | null => {
    let element: HTMLElement | null =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);

    while (element && element.dataset.offset === undefined) {
      element = element.parentElement;
      if (element === containerRef.current) return null;
    }
    if (!element?.dataset.offset) return null;

    return Number(element.dataset.offset) + offsetInNode;
  };

  const commit = (scope: ManualSpan["scope"]) => {
    if (!pending) return;
    onAddManual({
      page: 0,
      start: pending.start,
      end: pending.end,
      text: pending.text,
      scope,
    });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  };

  return (
    <div className="mt-6 rounded-2xl border border-ink-700 bg-ink-900/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-5 py-3">
        <Highlighter className="h-4 w-4 shrink-0 text-signal-400" strokeWidth={2} />
        <p className="text-sm font-medium text-ink-100">Review the document</p>
        <p className="w-full text-xs text-ink-400 sm:w-auto sm:flex-1">
          Click a highlight to keep it. Select any text to redact something we
          missed.
        </p>
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 bg-signal-400/5 px-5 py-3">
          <span className="font-mono text-xs text-ink-200">
            “{truncate(pending.text)}”
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => commit("occurrence")}
              className="rounded-lg bg-signal-500 px-3 py-1.5 text-xs font-medium text-accent-ink transition hover:bg-signal-400 disabled:opacity-50"
            >
              Redact this
            </button>
            {pending.occurrences > 1 && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => commit("all")}
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:bg-ink-800 disabled:opacity-50"
              >
                Redact all {pending.occurrences}
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        onMouseUp={readSelection}
        onTouchEnd={readSelection}
        onKeyUp={readSelection}
        className="max-h-[28rem] overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap select-text"
      >
        {segments.map((segment) =>
          segment.item ? (
            (() => {
              const kept = segment.item.kept === true;
              const def = CATEGORY_DEFS[segment.item.category];
              return (
                <mark
                  key={`${segment.start}-${segment.item.id}`}
                  data-offset={segment.start}
                  role="button"
                  tabIndex={0}
                  aria-pressed={!kept}
                  aria-label={`${def.singular}: ${segment.text}. ${
                    kept ? "Kept visible" : "Redacted"
                  }. Activate to ${kept ? "redact" : "keep"} it.`}
                  onClick={() => onToggleItem(segment.item!.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onToggleItem(segment.item!.id);
                    }
                  }}
                  className={`cursor-pointer rounded-sm px-0.5 transition ${
                    kept
                      ? // Kept items stay visible and distinguishable by more
                        // than colour, so the state is legible without it.
                        "bg-transparent text-ink-400 underline decoration-dashed decoration-ink-500 underline-offset-2"
                      : `${GROUP_HIGHLIGHT[def.group]} text-ink-50 underline decoration-2 underline-offset-2`
                  }`}
                >
                  {segment.text}
                </mark>
              );
            })()
          ) : (
            <span key={segment.start} data-offset={segment.start}>
              {segment.text}
            </span>
          )
        )}
      </div>

      {manualSpans.length > 0 && (
        <div className="border-t border-ink-800 px-5 py-3">
          <p className="text-xs font-medium text-ink-300">
            You marked {manualSpans.length}{" "}
            {manualSpans.length === 1 ? "value" : "values"}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {manualSpans.map((span) => (
              <li
                key={span.id}
                className="flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-800/60 py-1 pr-1 pl-2.5"
              >
                <span className="font-mono text-xs text-ink-200">
                  {truncate(span.text, 28)}
                </span>
                {span.scope === "all" && (
                  <span className="text-[10px] text-ink-400">all</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveManual(span.id)}
                  aria-label={`Stop redacting ${span.text}`}
                  className="rounded-full p-0.5 text-ink-400 transition hover:bg-ink-700 hover:text-danger-400"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex items-start gap-2 border-t border-ink-800 px-5 py-3 text-xs text-ink-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        This is the text the detectors read. Anything highlighted is removed from
        the file you download.
      </p>
    </div>
  );
}

function truncate(value: string, max = 48): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** How many whole-word occurrences of `value` the text contains. */
function countOccurrences(text: string, value: string): number {
  const needle = value.trim();
  if (!needle) return 0;

  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}
