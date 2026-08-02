import type { LucideIcon } from "lucide-react";
import { ShieldCheck, WifiOff, Cpu, Eye } from "lucide-react";

interface TrustCard {
  icon: LucideIcon;
  title: string;
  description: string;
}

const cards: TrustCard[] = [
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
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6"
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
