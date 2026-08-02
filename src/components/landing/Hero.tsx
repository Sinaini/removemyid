import { ArrowRight, WifiOff } from "lucide-react";
import GithubIcon from "../shared/GithubIcon";

interface HeroProps {
  onGetStarted: () => void;
}

export default function Hero({ onGetStarted }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[500px] opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--color-ink-500) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-gradient-to-b from-transparent via-transparent to-ink-950"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-signal-500/10 via-transparent to-transparent"
      />

      <div className="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center sm:pt-28">
        <h1 className="text-4xl font-semibold tracking-tight text-ink-50 sm:text-6xl">
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
            className="inline-flex items-center gap-2 rounded-lg bg-signal-500 px-6 py-3 text-sm font-medium text-accent-ink shadow-lg shadow-signal-500/20 transition hover:bg-signal-400 hover:shadow-signal-400/30 active:scale-[0.98]"
          >
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-4 py-1.5 text-xs font-medium text-ink-300">
            <WifiOff className="h-3.5 w-3.5 text-signal-400" strokeWidth={2} />
            100% client-side — nothing is ever uploaded
          </div>
          <a
            href="https://github.com/Sinaini/removemyid"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-4 py-1.5 text-xs font-medium text-ink-300 transition hover:border-ink-600 hover:text-ink-50"
          >
            <GithubIcon className="h-3.5 w-3.5 text-signal-400" />
            Open source — view on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
