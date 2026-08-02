import { useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import LandingPage from "./components/pages/LandingPage";
import RedactFunnel from "./components/pages/RedactFunnel";
import { trackPageView } from "./lib/analytics";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLanding = location.pathname === "/";

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        isLanding={isLanding}
        onLogoClick={() => navigate("/")}
        onGetStarted={() => navigate("/redact")}
      />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage onGetStarted={() => navigate("/redact")} />} />
          <Route path="/redact" element={<RedactFunnel />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
