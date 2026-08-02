import Hero from "../landing/Hero";
import TrustSection from "../landing/TrustSection";

interface LandingPageProps {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <>
      <Hero onGetStarted={onGetStarted} />
      <TrustSection />
    </>
  );
}
