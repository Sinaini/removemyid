import { useState } from "react";
import { useNavigate } from "react-router-dom";
import UploadPage from "./UploadPage";
import ConfigurePage from "./ConfigurePage";
import ResultsPage from "./ResultsPage";
import { useRedactionWorker } from "../../hooks/useRedactionWorker";
import { redactTextFile } from "../../lib/files/redactTextFile";
import { downloadBlob, withRedactedSuffix } from "../../lib/files/download";
import { defaultRedactionOptions } from "../../lib/redaction/options";
import type { RedactionOptions, RedactionSummary, UploadedFile } from "../../types";

type Step = "upload" | "configure" | "results";

interface PendingDownload {
  blob: Blob;
  filename: string;
}

export default function RedactFunnel() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [options, setOptions] = useState<RedactionOptions>(defaultRedactionOptions());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RedactionSummary | null>(null);
  const [pendingDownload, setPendingDownload] = useState<PendingDownload | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const { redact } = useRedactionWorker();

  const goHome = () => navigate("/");

  const handleFileSelected = (file: UploadedFile) => {
    setUploadedFile(file);
    setStep("configure");
  };

  const runRedaction = async (
    file: UploadedFile,
    opts: RedactionOptions,
    excluded: Set<string>,
    silent: boolean
  ) => {
    if (silent) {
      setIsUpdating(true);
    } else {
      setIsProcessing(true);
      setSummary(null);
      setPendingDownload(null);
    }
    setProcessingError(null);

    try {
      const filename = withRedactedSuffix(file.file.name);
      const excludedIdList = Array.from(excluded);

      if (file.file.type === "application/pdf") {
        const { redactPdfFile } = await import("../../lib/pdf/redactPdf");
        const result = await redactPdfFile(file.file, opts, excluded);
        setSummary(result.summary);
        setPendingDownload({ blob: result.blob, filename });
      } else if (file.file.type.startsWith("image/")) {
        const { redactImageFile } = await import("../../lib/images/redactImage");
        const result = await redactImageFile(file.file, opts, excluded);
        setSummary(result.summary);
        setPendingDownload({ blob: result.blob, filename });
      } else {
        const result = await redactTextFile(file.file, (text) =>
          redact(text, opts, excludedIdList)
        );
        setSummary(result.summary);
        setPendingDownload({ blob: result.blob, filename });
      }
    } catch (err) {
      if (silent) {
        // Regenerating after a delete failed — leave the prior summary/
        // download in place rather than replacing them with an error state.
        console.error(err);
      } else {
        setProcessingError(
          err instanceof Error
            ? err.message
            : "Something went wrong while redacting that file."
        );
      }
    } finally {
      if (silent) {
        setIsUpdating(false);
      } else {
        setIsProcessing(false);
      }
    }
  };

  const handleSubmitOptions = () => {
    if (!uploadedFile) return;
    setStep("results");
    setExcludedIds(new Set());
    void runRedaction(uploadedFile, options, new Set(), false);
  };

  const handleRetry = () => {
    if (!uploadedFile) return;
    setExcludedIds(new Set());
    void runRedaction(uploadedFile, options, new Set(), false);
  };

  const handleBackToConfigure = () => {
    setStep("configure");
  };

  const handleRemoveItem = (id: string) => {
    if (!uploadedFile) return;
    const next = new Set(excludedIds);
    next.add(id);
    setExcludedIds(next);
    void runRedaction(uploadedFile, options, next, true);
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
    <>
      {step === "upload" && <UploadPage onBack={goHome} onContinue={handleFileSelected} />}

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
          isUpdating={isUpdating}
          error={processingError}
          summary={summary}
          onDownload={handleDownload}
          onPreview={handlePreview}
          onRetry={handleRetry}
          onStartOver={goHome}
          onBack={handleBackToConfigure}
          onRemoveItem={handleRemoveItem}
        />
      )}
    </>
  );
}
