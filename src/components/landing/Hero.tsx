import { ArrowRight, WifiOff } from "lucide-react";

interface HeroProps {
  onGetStarted: () => void;
}

export default function Hero({ onGetStarted }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-signal-500/10 via-transparent to-transparent"
      />

      <div className="mx-auto max-w-3xl px-6 pt-20 pb-16 text-center sm:pt-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-4 py-1.5 text-xs font-medium text-ink-300">
          <WifiOff className="h-3.5 w-3.5 text-signal-400" strokeWidth={2} />
          100% client-side — nothing is ever uploaded
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-ink-50 sm:text-5xl">
          Redact your personal data,{" "}
          <span className="text-signal-400">without leaving your browser</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base text-ink-300 sm:text-lg">
          RemoveMyID scrubs names, emails, phone numbers, and IDs from your
          files. Every byte of processing happens locally on your device — no
          server, no upload, no third party ever sees your data.
        </p>

        <div className="mt-10">
          <button
            type="button"
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 rounded-lg bg-signal-500 px-6 py-3 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
          >
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  );
}
