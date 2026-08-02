import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { trackEvent } from "../../lib/analytics";

const SHARE_URL = "https://removemyid.vercel.app";
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

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share(SHARE_DATA);
        trackEvent("share_clicked", { method: "native_share" });
      } catch {
        // User cancelled the share sheet — not an error, don't track it.
      }
      return;
    }

    await navigator.clipboard.writeText(SHARE_URL);
    trackEvent("share_clicked", { method: "copy_link" });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
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
  );
}
