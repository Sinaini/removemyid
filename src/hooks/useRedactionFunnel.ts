import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRedactionWorker } from "./useRedactionWorker";
import { redactTextFile } from "../lib/files/redactTextFile";
import { downloadBlob, withRedactedSuffix } from "../lib/files/download";
import { ALL_CATEGORIES, defaultRedactionOptions } from "../lib/redaction/options";
import { trackEvent } from "../lib/analytics";
import type { RedactionOptions, RedactionSummary, UploadedFile } from "../types";

interface PendingDownload {
  blob: Blob;
  filename: string;
}

export function useRedactionFunnel() {
  const navigate = useNavigate();
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [options, setOptions] = useState<RedactionOptions>(defaultRedactionOptions());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingErrorDetail, setProcessingErrorDetail] = useState<string | null>(null);
  const [summary, setSummary] = useState<RedactionSummary | null>(null);
  const [pendingDownload, setPendingDownload] = useState<PendingDownload | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const { redact } = useRedactionWorker();

  const clearFile = () => {
    setUploadedFile(null);
  };

  const resetFunnel = () => {
    setUploadedFile(null);
    setOptions(defaultRedactionOptions());
    setIsProcessing(false);
    setIsUpdating(false);
    setProcessingError(null);
    setProcessingErrorDetail(null);
    setSummary(null);
    setPendingDownload(null);
    setExcludedIds(new Set());
  };

  const handleFileSelected = (file: UploadedFile) => {
    setUploadedFile(file);
    trackEvent("file_selected", { file_type: file.file.type || "unknown" });
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
    setProcessingErrorDetail(null);

    const fileType = file.file.type || "unknown";

    try {
      const filename = withRedactedSuffix(file.file.name);
      const excludedIdList = Array.from(excluded);

      let result: { summary: RedactionSummary; blob: Blob };
      if (file.file.type === "application/pdf") {
        const { redactPdfFile } = await import("../lib/pdf/redactPdf");
        result = await redactPdfFile(file.file, opts, excluded);
      } else if (file.file.type.startsWith("image/")) {
        const { redactImageFile } = await import("../lib/images/redactImage");
        result = await redactImageFile(file.file, opts, excluded);
      } else {
        result = await redactTextFile(file.file, (text) =>
          redact(text, opts, excludedIdList)
        );
      }

      setSummary(result.summary);
      setPendingDownload({ blob: result.blob, filename });

      if (!silent) {
        const countParams = Object.fromEntries(
          ALL_CATEGORIES.map((category) => [
            `${category}_count`,
            result.summary.counts[category],
          ])
        );
        trackEvent("redaction_completed", {
          file_type: fileType,
          total_items: result.summary.total,
          ...countParams,
        });
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
        // Not PII — this is a JS engine/parser error (name, message, stack),
        // shown so a failure on a device we can't remote-debug (e.g. a
        // locked-down mobile browser) can still be diagnosed from a screenshot.
        setProcessingErrorDetail(
          err instanceof Error
            ? `${err.name}: ${err.message}\n${err.stack ?? ""}`.trim()
            : String(err)
        );
        trackEvent("redaction_failed", {
          file_type: fileType,
          error_message:
            err instanceof Error ? err.message.slice(0, 100) : "unknown",
        });
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
    const enabledCategories = ALL_CATEGORIES.filter((category) => options[category].enabled);
    trackEvent("configure_submitted", { categories: enabledCategories.join(",") });
    setExcludedIds(new Set());
    navigate("/results");
    void runRedaction(uploadedFile, options, new Set(), false);
  };

  const handleRetry = () => {
    if (!uploadedFile) return;
    trackEvent("retry_clicked");
    setExcludedIds(new Set());
    void runRedaction(uploadedFile, options, new Set(), false);
  };

  const handleRemoveItem = (id: string) => {
    if (!uploadedFile) return;
    const category = summary?.items.find((item) => item.id === id)?.category;
    trackEvent("item_excluded", { category: category ?? "unknown" });
    const next = new Set(excludedIds);
    next.add(id);
    setExcludedIds(next);
    void runRedaction(uploadedFile, options, next, true);
  };

  const handleDownload = () => {
    if (!pendingDownload) return;
    trackEvent("download_clicked", { file_type: uploadedFile?.file.type || "unknown" });
    downloadBlob(pendingDownload.blob, pendingDownload.filename);
  };

  const handlePreview = () => {
    if (!pendingDownload) return;
    trackEvent("preview_clicked");
    const url = URL.createObjectURL(pendingDownload.blob);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return {
    uploadedFile,
    options,
    setOptions,
    isProcessing,
    isUpdating,
    processingError,
    processingErrorDetail,
    summary,
    clearFile,
    resetFunnel,
    handleFileSelected,
    handleSubmitOptions,
    handleRetry,
    handleRemoveItem,
    handleDownload,
    handlePreview,
  };
}

export type RedactionFunnel = ReturnType<typeof useRedactionFunnel>;
