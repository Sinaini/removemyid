import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudDownload, WifiOff } from "lucide-react";
import {
  LANG_LABELS,
  checkOfflinePack,
  formatBytes,
  warmOfflinePack,
  type OcrLang,
  type PackStatus,
} from "../../lib/pwa/offlinePack";
import { trackEvent } from "../../lib/analytics";

const ALL_LANGS = Object.keys(LANG_LABELS) as OcrLang[];

/**
 * Lets the user download the PDF and OCR engines ahead of time.
 *
 * Without this, "works offline" is only true for someone who happened to redact
 * a PDF while online first — those assets are runtime-cached, not precached.
 * A cold visitor who went offline got an opaque fetch failure with no
 * explanation, which is the gap this closes.
 */
export default function OfflinePackPanel() {
  const [langs, setLangs] = useState<OcrLang[]>(["eng"]);
  const [status, setStatus] = useState<PackStatus | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (selected: OcrLang[]) => {
    setStatus(await checkOfflinePack(selected));
  }, []);

  useEffect(() => {
    void refresh(langs);
  }, [langs, refresh]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const toggleLang = (lang: OcrLang) => {
    setLangs((current) =>
      current.includes(lang)
        ? current.filter((l) => l !== lang)
        : [...current, lang]
    );
  };

  const download = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    trackEvent("offline_pack_requested", { languages: langs.join(",") });
    await warmOfflinePack(
      langs,
      (done, total) => setProgress({ done, total }),
      controller.signal
    );
    setProgress(null);
    await refresh(langs);
  };

  const busy = progress !== null;
  const remaining = status ? status.totalBytes - status.cachedBytes : 0;

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900/40 px-5 py-4">
      <div className="flex items-center gap-2.5">
        {status?.ready ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-signal-400" strokeWidth={2} />
        ) : (
          <WifiOff className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={2} />
        )}
        <h2 className="text-sm font-medium text-ink-100">Use this offline</h2>
      </div>

      <p className="mt-2 text-xs text-ink-400">
        {status?.ready
          ? "Everything needed to redact PDFs and images is stored in this browser. You can disconnect and it will keep working."
          : "The app itself already works offline. PDF and image redaction need a one-off download of their engines — do it now and they'll work with no connection."}
      </p>

      <fieldset className="mt-3">
        <legend className="text-xs text-ink-400">
          Languages to recognise in images and scans
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ALL_LANGS.map((lang) => {
            const on = langs.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={busy}
                onClick={() => toggleLang(lang)}
                className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                  on
                    ? "border-signal-500 bg-signal-400/10 text-ink-50"
                    : "border-ink-700 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                }`}
              >
                {LANG_LABELS[lang]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {progress && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Downloading offline files"
            className="h-1.5 overflow-hidden rounded-full bg-ink-800"
          >
            <div
              className="h-full bg-signal-500 transition-[width] duration-200"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            Downloading {progress.done} of {progress.total} files…
          </p>
        </div>
      )}

      {!busy && (
        <button
          type="button"
          onClick={download}
          disabled={langs.length === 0}
          className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-ink-700 px-4 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-800 hover:text-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CloudDownload className="h-4 w-4" strokeWidth={2} />
          {status?.ready
            ? "Re-download offline files"
            : `Make available offline${remaining > 0 ? ` (${formatBytes(remaining)})` : ""}`}
        </button>
      )}
    </section>
  );
}
