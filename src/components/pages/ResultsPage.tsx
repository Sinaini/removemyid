import { AlertCircle, Loader2, Star } from "lucide-react";
import type { RedactionSummary } from "../../types";
import StepLayout from "../layout/StepLayout";
import RedactionSummaryPanel from "../landing/RedactionSummaryPanel";
import FeedbackButton from "../shared/FeedbackButton";
import ShareButton from "../shared/ShareButton";
import { trackEvent } from "../../lib/analytics";

interface ResultsPageProps {
  isProcessing: boolean;
  isUpdating: boolean;
  error: string | null;
  errorDetail: string | null;
  summary: RedactionSummary | null;
  onDownload: () => void;
  onPreview: () => void;
  onRetry: () => void;
  onStartOver: () => void;
  onBack: () => void;
  onRemoveItem: (id: string) => void;
}

export default function ResultsPage({
  isProcessing,
  isUpdating,
  error,
  errorDetail,
  summary,
  onDownload,
  onPreview,
  onRetry,
  onStartOver,
  onBack,
  onRemoveItem,
}: ResultsPageProps) {
  return (
    <StepLayout step={3} title="Results" onBack={onBack}>
      {isProcessing && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 px-6 py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-signal-400" strokeWidth={2} />
          <p className="text-sm text-ink-300">Redacting your file…</p>
        </div>
      )}

      {!isProcessing && error && (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/20 px-6 py-8 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-red-400" strokeWidth={2} />
          <p className="mt-3 text-sm text-red-300">{error}</p>
          {errorDetail && (
            <details className="mt-3 text-left">
              <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-300">
                Technical details (tap to expand, useful if reporting this)
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-950/60 p-3 text-left text-xs text-ink-400">
                {errorDetail}
              </pre>
            </details>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-signal-400 active:scale-[0.98]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onStartOver}
              className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-medium text-ink-300 transition hover:bg-ink-800 hover:text-ink-50"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {!isProcessing && !error && summary && (
        <>
          <RedactionSummaryPanel
            summary={summary}
            isUpdating={isUpdating}
            onDownload={onDownload}
            onPreview={onPreview}
            onReset={onStartOver}
            onRemoveItem={onRemoveItem}
          />

          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-signal-400/20 bg-signal-400/5 px-5 py-4">
            <Star className="h-5 w-5 shrink-0 text-signal-400" strokeWidth={2} />
            <p className="text-sm text-ink-300">
              Enjoying RemoveMyID?{" "}
              <a
                href="https://github.com/Sinaini/removemyid"
                target="_blank"
                rel="noreferrer"
                onClick={() => trackEvent("github_link_clicked", { location: "results_banner" })}
                className="font-medium text-signal-400 underline underline-offset-2 transition hover:text-signal-300"
              >
                Give us a star on GitHub
              </a>{" "}
              — it helps other people find the project.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <ShareButton />
            <FeedbackButton source="results" />
          </div>
        </>
      )}
    </StepLayout>
  );
}
