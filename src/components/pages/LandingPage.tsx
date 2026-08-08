import Hero from "../landing/Hero";
import TrustSection from "../landing/TrustSection";
import LanguagesSection from "../landing/LanguagesSection";
import UseCasesSection from "../landing/UseCasesSection";
import FeedbackSection from "../landing/FeedbackSection";
import OfflinePackPanel from "../shared/OfflinePackPanel";

interface LandingPageProps {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <>
      <Hero onGetStarted={onGetStarted} />
      <TrustSection />
      <LanguagesSection />
      <UseCasesSection />
      <div className="mx-auto w-full max-w-2xl px-6 pb-4">
        <OfflinePackPanel />
      </div>
      <FeedbackSection />
    </>
  );
}
