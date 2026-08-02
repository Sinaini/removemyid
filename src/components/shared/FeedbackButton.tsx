import { useState } from "react";
import { MessageSquare } from "lucide-react";
import FeedbackForm from "./FeedbackForm";
import Modal from "./Modal";

interface FeedbackButtonProps {
  source: "landing" | "results";
  className?: string;
}

const DEFAULT_CLASSNAME =
  "inline-flex items-center gap-2 rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition hover:bg-ink-800 hover:text-ink-50";

export default function FeedbackButton({ source, className }: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className ?? DEFAULT_CLASSNAME}
      >
        <MessageSquare className="h-4 w-4" strokeWidth={2} />
        Got feedback?
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Got feedback?">
        <p className="mb-4 text-sm text-ink-300">
          Tell us what's working, what's missing, or what broke. No account
          needed — just a quick note.
        </p>
        <FeedbackForm source={source} />
      </Modal>
    </>
  );
}
