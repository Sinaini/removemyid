import FeedbackButton from "../shared/FeedbackButton";

export default function FeedbackSection() {
  return (
    <section className="border-t border-ink-800/80">
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <FeedbackButton source="landing" />
      </div>
    </section>
  );
}
