import { useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import LandingPage from "./components/pages/LandingPage";
import RedactFunnel from "./components/pages/RedactFunnel";
import ResultsRoute from "./components/pages/ResultsRoute";
import { trackPageView, trackEvent } from "./lib/analytics";
import { useRedactionFunnel } from "./hooks/useRedactionFunnel";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const funnel = useRedactionFunnel();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  const startFunnel = () => {
    funnel.resetFunnel();
    trackEvent("funnel_started");
    navigate("/redact");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        isLanding={isLanding}
        onLogoClick={() => navigate("/")}
        onGetStarted={startFunnel}
      />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage onGetStarted={startFunnel} />} />
          <Route path="/redact" element={<RedactFunnel funnel={funnel} />} />
          <Route path="/results" element={<ResultsRoute funnel={funnel} />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
