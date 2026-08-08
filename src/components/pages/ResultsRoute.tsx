import { Navigate, useNavigate } from "react-router-dom";
import ResultsPage from "./ResultsPage";
import type { RedactionFunnel } from "../../hooks/useRedactionFunnel";

interface ResultsRouteProps {
  funnel: RedactionFunnel;
}

export default function ResultsRoute({ funnel }: ResultsRouteProps) {
  const navigate = useNavigate();

  if (!funnel.uploadedFile) {
    return <Navigate to="/redact" replace />;
  }

  return (
    <ResultsPage
      isProcessing={funnel.isProcessing}
      isUpdating={funnel.isUpdating}
      error={funnel.processingError}
      errorDetail={funnel.processingErrorDetail}
      summary={funnel.summary}
      warnings={funnel.warnings}
      staleOutput={funnel.staleOutput}
      onDownload={funnel.handleDownload}
      onPreview={funnel.handlePreview}
      onRetry={funnel.handleRetry}
      onStartOver={() => {
        funnel.resetFunnel();
        navigate("/");
      }}
      onBack={() => navigate("/redact")}
      onRemoveItem={funnel.handleRemoveItem}
    />
  );
}
