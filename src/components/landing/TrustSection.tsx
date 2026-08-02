import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ShieldCheck, WifiOff, Cpu, Eye } from "lucide-react";

type Mode = "simple" | "technical";

interface TrustCard {
  icon: LucideIcon;
  title: string;
  description: string;
}

const simpleCards: TrustCard[] = [
  {
    icon: WifiOff,
    title: "Nothing gets uploaded",
    description:
      "Your file stays on your device the whole time. We never see it, and neither does anyone else.",
  },
  {
    icon: Cpu,
    title: "Runs right on your computer",
    description:
      "All the redacting happens on your own device, so the page stays smooth and nothing gets sent anywhere.",
  },
  {
    icon: Eye,
    title: "No mystery AI",
    description:
      "We use simple, checkable rules to spot personal info — not a black-box AI you have to blindly trust.",
  },
  {
    icon: ShieldCheck,
    title: "Works without internet",
    description:
      "Once the page has loaded, you can even go offline — it still works.",
  },
];

const detailedCards: TrustCard[] = [
  {
    icon: WifiOff,
    title: "No uploads, ever",
    description:
      "Your file never touches a network request. There is no backend that processes or stores what you drop in.",
  },
  {
    icon: Cpu,
    title: "Runs in a Web Worker",
    description:
      "Redaction happens on a background thread on your own device, so the page stays responsive while it works.",
  },
  {
    icon: Eye,
    title: "Nothing to trust but math",
    description:
      "Detection uses transparent regex and NLP rules running locally — no black-box API calls to a third party.",
  },
  {
    icon: ShieldCheck,
    title: "Works offline",
    description:
      "Once the page has loaded, you can disconnect from the internet entirely and redaction still works.",
  },
];

export default function TrustSection() {
  const [mode, setMode] = useState<Mode>("simple");
  const cards = mode === "simple" ? simpleCards : detailedCards;

  return (
    <section id="how-it-works" className="border-t border-ink-800/80">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
            Privacy by architecture, not by policy
          </h2>
          <p className="mt-3 text-ink-300">
            We can't leak what we never receive. Here's how RemoveMyID keeps
            it that way.
          </p>

          <p className="mt-6 text-xs font-medium tracking-wide text-ink-500 uppercase">
            Explanation level
          </p>
          <div
            role="tablist"
            aria-label="Explanation detail level"
            className="mt-2 inline-flex items-center rounded-full border border-ink-700 bg-ink-900/50 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "simple"}
              onClick={() => setMode("simple")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === "simple"
                  ? "bg-signal-400/15 text-signal-400"
                  : "text-ink-300 hover:text-ink-50"
              }`}
            >
              User-friendly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "technical"}
              onClick={() => setMode("technical")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === "technical"
                  ? "bg-signal-400/15 text-signal-400"
                  : "text-ink-300 hover:text-ink-50"
              }`}
            >
              Technical
            </button>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6 transition hover:-translate-y-0.5 hover:border-ink-600 hover:bg-ink-900/70"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-signal-400/15 text-signal-400">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-semibold text-ink-50">{title}</h3>
              <p className="mt-2 text-sm text-ink-400">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
