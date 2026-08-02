import Hero from "../landing/Hero";
import TrustSection from "../landing/TrustSection";
import LanguagesSection from "../landing/LanguagesSection";
import UseCasesSection from "../landing/UseCasesSection";
import FeedbackSection from "../landing/FeedbackSection";

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
      <FeedbackSection />
    </>
  );
}
