import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { PIICategory, RedactionOptions } from "../../types";
import StepLayout from "../layout/StepLayout";
import { CATEGORY_ICONS } from "../../lib/redaction/categoryMeta";
import {
  CATEGORY_DEFS,
  GROUP_LABELS,
  GROUP_ORDER,
  categoriesInGroup,
  type CategoryGroup,
} from "../../lib/redaction/registry";

interface ConfigurePageProps {
  filename: string;
  options: RedactionOptions;
  onOptionsChange: (options: RedactionOptions) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export default function ConfigurePage({
  filename,
  options,
  onOptionsChange,
  onBack,
  onSubmit,
}: ConfigurePageProps) {
  // Groups start collapsed. With nineteen categories a flat list is a wall of
  // checkboxes; collapsed cards with a count badge mean someone who is happy
  // with the defaults never has to expand anything.
  const [expanded, setExpanded] = useState<Set<CategoryGroup>>(new Set());

  const update = (category: PIICategory, patch: Partial<RedactionOptions[PIICategory]>) => {
    onOptionsChange({ ...options, [category]: { ...options[category], ...patch } });
  };

  const setGroup = (group: CategoryGroup, enabled: boolean) => {
    const next = { ...options };
    for (const category of categoriesInGroup(group)) {
      next[category] = { ...next[category], enabled };
    }
    onOptionsChange(next);
  };

  const toggleExpanded = (group: CategoryGroup) => {
    const next = new Set(expanded);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setExpanded(next);
  };

  const anyEnabled = Object.values(options).some((option) => option.enabled);

  return (
    <StepLayout
      step={2}
      title="What would you like to redact?"
      description={`Choose which categories to scrub from “${filename}.”`}
      onBack={onBack}
    >
      <div className="space-y-3">
        {GROUP_ORDER.map((group) => {
          const categories = categoriesInGroup(group);
          if (categories.length === 0) return null;

          const onCount = categories.filter((c) => options[c].enabled).length;
          const isOpen = expanded.has(group);
          const allOn = onCount === categories.length;

          return (
            <div
              key={group}
              className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/40"
            >
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allOn}
                  // Indeterminate can only be set imperatively, not via an attribute.
                  ref={(el) => {
                    if (el) el.indeterminate = onCount > 0 && !allOn;
                  }}
                  onChange={() => setGroup(group, !allOn)}
                  aria-label={`Turn ${allOn ? "off" : "on"} every category in ${GROUP_LABELS[group]}`}
                  className="h-4 w-4 shrink-0 rounded border-ink-600 bg-ink-800 accent-signal-500"
                />
                <span className="text-sm font-medium text-ink-50">
                  {GROUP_LABELS[group]}
                </span>
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-medium text-ink-300">
                  {onCount} of {categories.length} on
                </span>
                <button
                  type="button"
                  onClick={() => toggleExpanded(group)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${GROUP_LABELS[group]}`}
                  className="rounded-lg p-1 text-ink-400 transition hover:bg-ink-800 hover:text-ink-50"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    strokeWidth={2}
                  />
                </button>
              </div>

              {isOpen && (
                <div className="space-y-2 border-t border-ink-800 px-4 py-3">
                  {categories.map((category) => {
                    const Icon = CATEGORY_ICONS[category];
                    const option = options[category];

                    return (
                      <div key={category}>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={option.enabled}
                            onChange={() => update(category, { enabled: !option.enabled })}
                            className="h-4 w-4 shrink-0 rounded border-ink-600 bg-ink-800 accent-signal-500"
                          />
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              option.enabled ? "text-signal-400" : "text-ink-500"
                            }`}
                            strokeWidth={2}
                          />
                          <span
                            className={`text-sm ${
                              option.enabled ? "text-ink-100" : "text-ink-500"
                            }`}
                          >
                            {CATEGORY_DEFS[category].plural}
                          </span>
                        </label>

                        {option.enabled && (
                          <div className="mt-2 pl-7">
                            <input
                              type="text"
                              value={option.exactValue}
                              onChange={(e) =>
                                update(category, { exactValue: e.target.value })
                              }
                              placeholder="Optional — only these value(s), comma-separated"
                              aria-label={`Specific ${CATEGORY_DEFS[category].plural.toLowerCase()} to redact`}
                              className="block w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-signal-500 focus:outline-none"
                            />
                            {option.exactValue.trim() && (
                              // This is a trade-off, not an enhancement, and it
                              // is easy to walk into by accident: entering your
                              // own phone number here stops every *other* phone
                              // number in the file being redacted.
                              <p className="mt-1.5 text-xs text-warn-400">
                                Only these values will be redacted. Every other{" "}
                                {CATEGORY_DEFS[category].singular.toLowerCase()} in
                                the file will stay visible.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!anyEnabled}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-signal-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Redact this file
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </button>

      {!anyEnabled && (
        <p className="mt-3 text-center text-xs text-ink-500">
          Select at least one category to continue.
        </p>
      )}
    </StepLayout>
  );
}
