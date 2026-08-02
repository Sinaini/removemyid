import ThemeToggle from "./ThemeToggle";
import GithubIcon from "../shared/GithubIcon";

interface HeaderProps {
  isLanding: boolean;
  onLogoClick: () => void;
  onGetStarted: () => void;
}

export default function Header({ isLanding, onLogoClick, onGetStarted }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center gap-2"
        >
          <img
            src="/logo.png"
            alt=""
            className="h-8 w-8 rounded-lg"
            width={32}
            height={32}
          />
          <span className="text-lg font-semibold tracking-tight text-ink-50">
            RemoveMyID
          </span>
        </button>

        <div className="flex items-center gap-4">
          {isLanding && (
            <nav className="hidden items-center gap-6 text-sm text-ink-300 sm:flex">
              
              <a
                href="https://github.com/Sinaini/removemyid"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 transition hover:text-ink-50"
              >
                <GithubIcon className="h-4 w-4" />
                
              </a>
            </nav>
          )}

          {isLanding && (
            <a
              href="https://github.com/Sinaini/removemyid"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
              className="text-ink-300 transition hover:text-ink-50 sm:hidden"
            >
              <GithubIcon className="h-5 w-5" />
            </a>
          )}

          <ThemeToggle />

          {isLanding && (
            <button
              type="button"
              onClick={onGetStarted}
              className="hidden rounded-lg bg-signal-500 px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-signal-400 active:scale-[0.98] sm:block"
            >
              Redact a file
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
