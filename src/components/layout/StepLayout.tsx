import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface StepLayoutProps {
  step: 1 | 2 | 3;
  title: string;
  description?: string;
  onBack?: () => void;
  children: ReactNode;
}

const TOTAL_STEPS = 3;

export default function StepLayout({
  step,
  title,
  description,
  onBack,
  children,
}: StepLayoutProps) {
  return (
    <section className="mx-auto max-w-2xl px-6 py-14 sm:py-20">
      <div className="mb-8 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={`h-1.5 w-6 rounded-full transition ${
                n <= step ? "bg-signal-400" : "bg-ink-800"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-300 sm:text-base">
            {description}
          </p>
        )}
      </div>

      <div className="mt-10">{children}</div>
    </section>
  );
}
