import { useState } from "react";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import LandingPage from "./components/pages/LandingPage";
import UploadPage from "./components/pages/UploadPage";
import ConfigurePage from "./components/pages/ConfigurePage";
import ResultsPage from "./components/pages/ResultsPage";
import { useRedactionWorker } from "./hooks/useRedactionWorker";
import { redactTextFile } from "./lib/files/redactTextFile";
import { downloadBlob, withRedactedSuffix } from "./lib/files/download";
import { defaultRedactionOptions } from "./lib/redaction/options";
import type { RedactionOptions, RedactionSummary, UploadedFile } from "./types";

type Step = "landing" | "upload" | "configure" | "results";

interface PendingDownload {
  blob: Blob;
  filename: string;
}

function App() {
  const [step, setStep] = useState<Step>("landing");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [options, setOptions] = useState<RedactionOptions>(defaultRedactionOptions());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RedactionSummary | null>(null);
  const [pendingDownload, setPendingDownload] = useState<PendingDownload | null>(null);
  const { redact } = useRedactionWorker();

  const resetAll = () => {
    setStep("landing");
    setUploadedFile(null);
    setOptions(defaultRedactionOptions());
    setIsProcessing(false);
    setProcessingError(null);
    setSummary(null);
    setPendingDownload(null);
  };

  const handleFileSelected = (file: UploadedFile) => {
    setUploadedFile(file);
    setStep("configure");
  };

  const processFile = async (file: UploadedFile, opts: RedactionOptions) => {
    setIsProcessing(true);
    setProcessingError(null);
    setSummary(null);
    setPendingDownload(null);

    try {
      const filename = withRedactedSuffix(file.file.name);

      if (file.file.type === "application/pdf") {
        const { redactPdfFile } = await import("./lib/pdf/redactPdf");
        const result = await redactPdfFile(file.file, opts);
        setSummary(result.summary);
        setPendingDownload({ blob: result.blob, filename });
      } else {
        const result = await redactTextFile(file.file, (text) => redact(text, opts));
        setSummary(result.summary);
        setPendingDownload({ blob: result.blob, filename });
      }
    } catch (err) {
      setProcessingError(
        err instanceof Error
          ? err.message
          : "Something went wrong while redacting that file."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitOptions = () => {
    if (!uploadedFile) return;
    setStep("results");
    void processFile(uploadedFile, options);
  };

  const handleRetry = () => {
    if (!uploadedFile) return;
    void processFile(uploadedFile, options);
  };

  const handleDownload = () => {
    if (!pendingDownload) return;
    downloadBlob(pendingDownload.blob, pendingDownload.filename);
  };

  const handlePreview = () => {
    if (!pendingDownload) return;
    const url = URL.createObjectURL(pendingDownload.blob);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        isLanding={step === "landing"}
        onLogoClick={resetAll}
        onGetStarted={() => setStep("upload")}
      />
      <main className="flex-1">
        {step === "landing" && <LandingPage onGetStarted={() => setStep("upload")} />}

        {step === "upload" && (
          <UploadPage onBack={resetAll} onContinue={handleFileSelected} />
        )}

        {step === "configure" && uploadedFile && (
          <ConfigurePage
            filename={uploadedFile.file.name}
            options={options}
            onOptionsChange={setOptions}
            onBack={() => setStep("upload")}
            onSubmit={handleSubmitOptions}
          />
        )}

        {step === "results" && (
          <ResultsPage
            isProcessing={isProcessing}
            error={processingError}
            summary={summary}
            onDownload={handleDownload}
            onPreview={handlePreview}
            onRetry={handleRetry}
            onStartOver={resetAll}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
