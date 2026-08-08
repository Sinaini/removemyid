import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { trackEvent } from "../../lib/analytics";
import { copyToClipboard } from "../../lib/clipboard";
import Modal from "./Modal";

const SHARE_URL = "https://www.removemyid.com";
const SHARE_DATA = {
  title: "RemoveMyID",
  text: "Redact personal info from your files, 100% in your browser.",
  url: SHARE_URL,
};

const DEFAULT_CLASSNAME =
  "inline-flex items-center gap-2 rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition hover:bg-ink-800 hover:text-ink-50";

interface ShareButtonProps {
  className?: string;
}

export default function ShareButton({ className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const handleShare = async () => {
    // canShare tells us the payload is actually acceptable; `navigator.share`
    // existing does not (some browsers expose it but reject a url-only share),
    // and a rejection there would silently do nothing at all.
    if (navigator.share && navigator.canShare?.(SHARE_DATA) !== false) {
      try {
        await navigator.share(SHARE_DATA);
        trackEvent("share_clicked", { method: "native_share" });
        return;
      } catch {
        // Either the user cancelled the sheet or the platform refused the
        // payload. Neither is worth reporting, but we fall through to the
        // clipboard path so the button still does something useful.
      }
    }

    if (await copyToClipboard(SHARE_URL)) {
      trackEvent("share_clicked", { method: "copy_link" });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    // Last resort: show the URL so it can be copied by hand. Previously an
    // unguarded clipboard call threw an unhandled rejection here (the
    // Clipboard API is undefined on non-secure origins) and the button just
    // appeared broken.
    setFallbackUrl(SHARE_URL);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleShare}
        className={className ?? DEFAULT_CLASSNAME}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" strokeWidth={2} />
            Link copied!
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" strokeWidth={2} />
            Share RemoveMyID
          </>
        )}
      </button>

      <Modal
        isOpen={fallbackUrl !== null}
        onClose={() => setFallbackUrl(null)}
        title="Copy this link"
      >
        <p className="text-sm text-ink-300">
          Your browser wouldn't let us copy for you — here's the link.
        </p>
        <input
          readOnly
          value={fallbackUrl ?? ""}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100"
        />
      </Modal>
    </>
  );
}
