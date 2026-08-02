import type { LucideIcon } from "lucide-react";
import { Bot, Users, Scale, Headphones, GraduationCap, Briefcase } from "lucide-react";

interface UseCase {
  icon: LucideIcon;
  title: string;
  description: string;
}

const useCases: UseCase[] = [
  {
    icon: Bot,
    title: "Prompting LLMs and AI tools",
    description:
      "Strip names, emails, and ID numbers from contracts, transcripts, or logs before pasting them into ChatGPT, Claude, or any AI tool — keep the context, drop the identity.",
  },
  {
    icon: Users,
    title: "Sharing with contractors or vendors",
    description:
      "Send specs, tickets, or datasets to external freelancers and vendors without exposing your customers' or employees' personal details.",
  },
  {
    icon: Scale,
    title: "Public records & FOIA requests",
    description:
      "Redact personal information from documents before they're published or released under open-records and freedom-of-information laws.",
  },
  {
    icon: Headphones,
    title: "Support tickets & bug reports",
    description:
      "Scrub customer PII from logs and tickets before sharing them with a vendor, filing a bug, or posting in a public forum.",
  },
  {
    icon: GraduationCap,
    title: "Research & data sharing",
    description:
      "Anonymize participant data before publishing a dataset or sharing it with collaborators outside your institution.",
  },
  {
    icon: Briefcase,
    title: "Hiring & HR documents",
    description:
      "Redact identifying details from resumes or applications for blind review, or scrub employee data before archiving records.",
  },
];

export default function UseCasesSection() {
  return (
    <section className="border-t border-ink-800/80">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
            Where people use RemoveMyID
          </h2>
          <p className="mt-3 text-ink-300">
            Anywhere a file needs to leave your hands but the personal data in
            it shouldn't.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map(({ icon: Icon, title, description }) => (
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
