import { US, IL, ES, FR, DE } from "country-flag-icons/react/3x2";

interface Language {
  Flag: (props: { className?: string }) => React.JSX.Element;
  name: string;
  nativeName: string;
  iso: string;
}

const languages: Language[] = [
  { Flag: US, name: "English", nativeName: "English", iso: "EN" },
  { Flag: IL, name: "Hebrew", nativeName: "עברית", iso: "HE" },
  { Flag: ES, name: "Spanish", nativeName: "Español", iso: "ES" },
  { Flag: FR, name: "French", nativeName: "Français", iso: "FR" },
  { Flag: DE, name: "German", nativeName: "Deutsch", iso: "DE" },
];

export default function LanguagesSection() {
  return (
    <section className="border-t border-ink-800/80">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
            Supported languages
          </h2>
          <p className="mt-3 text-ink-300">
            Image redaction reads text in these languages via on-device OCR —
            no file or text ever leaves your browser to do it.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {languages.map(({ Flag, name, nativeName, iso }) => (
            <div
              key={iso}
              className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 px-5 py-3 transition hover:-translate-y-0.5 hover:border-ink-600 hover:bg-ink-900/70"
            >
              <Flag className="h-6 w-8 shrink-0 rounded-sm" />
              <div>
                <p className="text-sm font-semibold text-ink-50">{name}</p>
                <p className="text-xs text-ink-400">{nativeName}</p>
              </div>
              <span className="ml-1 rounded-full bg-ink-800 px-2 py-0.5 text-xs font-medium text-ink-400">
                {iso}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
