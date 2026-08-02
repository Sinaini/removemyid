import { ArrowRight } from "lucide-react";
import type { PIICategory, RedactionOptions } from "../../types";
import StepLayout from "../layout/StepLayout";
import { CATEGORY_META, CATEGORY_ORDER } from "../../lib/redaction/categoryMeta";

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
  const toggleCategory = (category: PIICategory) => {
    onOptionsChange({
      ...options,
      [category]: { ...options[category], enabled: !options[category].enabled },
    });
  };

  const setExactValue = (category: PIICategory, exactValue: string) => {
    onOptionsChange({
      ...options,
      [category]: { ...options[category], exactValue },
    });
  };

  const anyEnabled = CATEGORY_ORDER.some((category) => options[category].enabled);

  return (
    <StepLayout
      step={2}
      title="What would you like to redact?"
      description={`Choose which categories to scrub from “${filename}.” Leave the optional field blank to redact every match, or list specific value(s) to target only those.`}
      onBack={onBack}
    >
      <div className="space-y-3">
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const Icon = meta.icon;
          const opt = options[category];

          return (
            <div
              key={category}
              className={`rounded-xl border px-4 py-3.5 transition ${
                opt.enabled
                  ? "border-ink-700 bg-ink-900/50"
                  : "border-ink-800 bg-ink-900/20"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={opt.enabled}
                  onChange={() => toggleCategory(category)}
                  className="h-4 w-4 shrink-0 rounded border-ink-600 bg-ink-800 accent-signal-500"
                />
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    opt.enabled ? "text-signal-400" : "text-ink-500"
                  }`}
                  strokeWidth={2}
                />
                <span
                  className={`text-sm font-medium ${
                    opt.enabled ? "text-ink-50" : "text-ink-500"
                  }`}
                >
                  {meta.plural}
                </span>
              </label>

              {opt.enabled && (
                <input
                  type="text"
                  value={opt.exactValue}
                  onChange={(e) => setExactValue(category, e.target.value)}
                  placeholder={`Optional — only remove specific value(s), comma-separated`}
                  className="mt-2.5 ml-7 block w-[calc(100%-1.75rem)] rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-signal-500 focus:outline-none"
                />
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
