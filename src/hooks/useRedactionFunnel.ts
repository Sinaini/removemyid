import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRedactionWorker } from "./useRedactionWorker";
import { redactTextFile } from "../lib/files/redactTextFile";
import { sniffFile } from "../lib/files/sniff";
import {
  downloadBlob,
  openBlobPreview,
  outputFilename,
  withRedactedSuffix,
  type PreviewHandle,
} from "../lib/files/download";
import { ALL_CATEGORIES, defaultRedactionOptions } from "../lib/redaction/options";
import { trackEvent } from "../lib/analytics";
import type { RedactionOptions, RedactionSummary, UploadedFile } from "../types";

interface PendingDownload {
  blob: Blob;
  filename: string;
}

/**
 * A caveat about the redaction that the user needs to see but which is not an
 * error: a page was read with OCR, an image was downscaled, right-to-left text
 * was covered a whole run at a time.
 */
export interface RedactionWarning {
  code: string;
  page?: number;
  detail?: string;
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
  // Mirrors excludedRef for rendering. The ref is the source of truth; this
  // exists so a change re-renders the panel.
  const [, setExcludedIds] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<RedactionWarning[]>([]);
  const [staleOutput, setStaleOutput] = useState(false);
  const { redact } = useRedactionWorker();

  // A preview URL has to outlive the click that opened it (the user is reading
  // the file in another tab), so it can't be revoked on a timer. Holding the
  // handle lets us revoke the previous one when a new preview opens and on
  // unmount — previously every Preview click leaked a blob for the session.
  const previewRef = useRef<PreviewHandle | null>(null);
  // Authoritative copies of state that is read inside async callbacks, where a
  // render-time snapshot would be stale.
  const excludedRef = useRef<Set<string>>(new Set());
  const runIdRef = useRef(0);
  useEffect(() => {
    return () => {
      previewRef.current?.revoke();
      previewRef.current = null;
    };
  }, []);

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
    excludedRef.current = new Set();
    setWarnings([]);
    setStaleOutput(false);
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
    // A generation token. Every state write below is gated on this run still
    // being the current one, so a slow earlier run can no longer overwrite a
    // newer result — which previously left the downloadable blob disagreeing
    // with the summary on screen.
    const runId = ++runIdRef.current;
    const isCurrent = () => runIdRef.current === runId;

    if (silent) {
      setIsUpdating(true);
    } else {
      setIsProcessing(true);
      setSummary(null);
      setPendingDownload(null);
      setStaleOutput(false);
    }
    setProcessingError(null);
    setProcessingErrorDetail(null);

    const fileType = file.file.type || "unknown";

    try {
      const excludedIdList = Array.from(excluded);

      let result: {
        summary: RedactionSummary;
        blob: Blob;
        // Present when the output format differs from the input's (a .webp the
        // browser could only encode as PNG), so the filename can describe the
        // real bytes instead of lying about them.
        extension?: string;
        warnings?: RedactionWarning[];
      };

      // Dispatch on what the file actually is, not on the browser's MIME guess.
      // The old catch-all `else` decoded anything non-PDF, non-image as UTF-8
      // text, so a PDF that arrived with an empty `type` came back as a corrupt
      // ".pdf" full of mojibake.
      const sniffed = await sniffFile(file.file);
      if (sniffed.kind === "rejected") throw new Error(sniffed.detail);

      let filename = withRedactedSuffix(file.file.name);

      if (sniffed.formatId === "pdf") {
        const { redactPdfFile } = await import("../lib/pdf/redactPdf");
        result = await redactPdfFile(file.file, opts, excluded);
      } else if (sniffed.formatId === "image") {
        const { redactImageFile } = await import("../lib/images/redactImage");
        result = await redactImageFile(file.file, opts, excluded);
      } else {
        result = await redactTextFile(
          file.file,
          (text) => redact(text, opts, excludedIdList),
          sniffed.formatId,
          sniffed.mimeType
        );
      }

      if (result.extension) {
        filename = outputFilename(file.file.name, result.extension);
      }

      if (!isCurrent()) return;

      setSummary(result.summary);
      setWarnings(result.warnings ?? []);
      setPendingDownload({ blob: result.blob, filename });
      setStaleOutput(false);

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
      if (!isCurrent()) return;

      if (silent) {
        // Regenerating after an exclusion failed. The prior summary stays on
        // screen, but the download must be marked stale: previously the button
        // remained wired to the old blob with no indication, so the user could
        // download a file that did not match the list in front of them.
        console.error(err);
        setStaleOutput(true);
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
      if (isCurrent()) {
        if (silent) {
          setIsUpdating(false);
        } else {
          setIsProcessing(false);
        }
      }
    }
  };

  const handleSubmitOptions = () => {
    if (!uploadedFile) return;
    const enabledCategories = ALL_CATEGORIES.filter((category) => options[category].enabled);
    trackEvent("configure_submitted", { categories: enabledCategories.join(",") });
    setExcludedIds(new Set());
    excludedRef.current = new Set();
    navigate("/results");
    void runRedaction(uploadedFile, options, new Set(), false);
  };

  const handleRetry = () => {
    if (!uploadedFile) return;
    trackEvent("retry_clicked");
    setExcludedIds(new Set());
    excludedRef.current = new Set();
    void runRedaction(uploadedFile, options, new Set(), false);
  };

  const handleRemoveItem = (id: string) => {
    if (!uploadedFile) return;
    const category = summary?.items.find((item) => item.id === id)?.category;
    trackEvent("item_excluded", { category: category ?? "unknown" });

    // Built from the ref, not from the `excludedIds` value captured in this
    // render. Two clicks dispatched before React re-renders both used to read the
    // same stale snapshot, so the first exclusion was silently discarded and the
    // item reappeared redacted with no error.
    const next = new Set(excludedRef.current);
    next.add(id);
    excludedRef.current = next;
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
    previewRef.current?.revoke();
    previewRef.current = openBlobPreview(pendingDownload.blob);
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
    warnings,
    staleOutput,
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
