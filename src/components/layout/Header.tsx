import { ShieldCheck } from "lucide-react";

interface HeaderProps {
  isLanding: boolean;
  onLogoClick: () => void;
  onGetStarted: () => void;
}

export default function Header({ isLanding, onLogoClick, onGetStarted }: HeaderProps) {
  return (
    <header className="border-b border-ink-800/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center gap-2"
        >
          <ShieldCheck className="h-6 w-6 text-signal-400" strokeWidth={2} />
          <span className="text-lg font-semibold tracking-tight text-ink-50">
            RemoveMyID
          </span>
        </button>

        {isLanding && (
          <>
            <nav className="hidden items-center gap-8 text-sm text-ink-300 sm:flex">
              <a href="#how-it-works" className="transition hover:text-ink-50">
                How it works
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-ink-50"
              >
                GitHub
              </a>
            </nav>

            <button
              type="button"
              onClick={onGetStarted}
              className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
            >
              Redact a file
            </button>
          </>
        )}
      </div>
    </header>
  );
}
