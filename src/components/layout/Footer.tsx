export default function Footer() {
  return (
    <footer className="border-t border-ink-800/80">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-ink-400 sm:flex-row">
        <div className="flex items-center gap-2">
          <img
            src="/favicon/favicon-32x32.png"
            alt=""
            className="h-4 w-4 rounded-sm"
            width={16}
            height={16}
          />
          <span>RemoveMyID</span>
        </div>
        <p className="text-center sm:text-right">
          Your files are processed entirely on your device and are never
          uploaded, stored, or transmitted anywhere.
        </p>
      </div>
    </footer>
  );
}
