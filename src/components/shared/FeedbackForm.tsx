import { useEffect } from "react";
import { useForm, ValidationError } from "@formspree/react";
import { Send, CheckCircle2 } from "lucide-react";
import { trackEvent } from "../../lib/analytics";

const FORMSPREE_FORM_ID = import.meta.env.VITE_FORMSPREE_FORM_ID;

interface FeedbackFields {
  message: string;
  email: string;
  source: string;
  [key: string]: string;
}

interface FeedbackFormProps {
  source: "landing" | "results";
}

export default function FeedbackForm({ source }: FeedbackFormProps) {
  const [state, handleSubmit] = useForm<FeedbackFields>(FORMSPREE_FORM_ID);

  useEffect(() => {
    if (state.succeeded) {
      trackEvent("feedback_submitted", { source });
    }
  }, [state.succeeded, source]);

  if (state.succeeded) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-signal-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
        Thanks — we read every message.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="source" value={source} />

      <div>
        <textarea
          id={`feedback-message-${source}`}
          name="message"
          required
          rows={3}
          placeholder="What's working, what's missing, what would make this more useful? (Please don't include any personal info.)"
          className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-signal-500 focus:outline-none"
        />
        <ValidationError
          prefix="Message"
          field="message"
          errors={state.errors}
          className="mt-1 text-xs text-red-400"
        />
      </div>

      <div>
        <input
          id={`feedback-email-${source}`}
          type="email"
          name="email"
          placeholder="Email (optional, if you'd like a reply)"
          className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-signal-500 focus:outline-none"
        />
        <ValidationError
          prefix="Email"
          field="email"
          errors={state.errors}
          className="mt-1 text-xs text-red-400"
        />
      </div>

      <button
        type="submit"
        disabled={state.submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-signal-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Send className="h-4 w-4" strokeWidth={2} />
        {state.submitting ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
