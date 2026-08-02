import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { ArrowRight, File as FileIcon, Upload, X, AlertCircle } from "lucide-react";
import type { UploadedFile } from "../../types";
import StepLayout from "../layout/StepLayout";
import { trackEvent } from "../../lib/analytics";
import { generateId } from "../../lib/id";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

interface UploadPageProps {
  onBack: () => void;
  onContinue: (file: UploadedFile) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage({ onBack, onContinue }: UploadPageProps) {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length > 0) {
        const reason = fileRejections[0].errors[0];
        trackEvent("file_rejected", { reason: reason.code });
        setError(
          reason.code === "file-too-large"
            ? "That file is larger than 25 MB. Try a smaller file."
            : "Unsupported file type. Please upload a .txt, .csv, .pdf, .jpg, .png, or .webp file."
        );
        setUploadedFile(null);
        return;
      }

      const file = acceptedFiles[0];
      if (file) {
        setError(null);
        setUploadedFile({ file, id: generateId() });
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: MAX_FILE_SIZE_BYTES,
    accept: {
      "text/plain": [".txt"],
      "text/csv": [".csv"],
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
  });

  return (
    <StepLayout
      step={1}
      title="Upload your file"
      description="Choose the file you'd like to redact. It never leaves this browser tab."
      onBack={onBack}
    >
      {!uploadedFile ? (
        <div
          {...getRootProps()}
          className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
            isDragActive
              ? "border-signal-400 bg-signal-400/5"
              : "border-ink-700 bg-ink-900/50 hover:border-ink-600 hover:bg-ink-900"
          }`}
        >
          <input {...getInputProps()} />
          <div
            className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full transition ${
              isDragActive
                ? "bg-signal-400/15 text-signal-400"
                : "bg-ink-800 text-ink-300 group-hover:text-signal-400"
            }`}
          >
            <Upload className="h-6 w-6" strokeWidth={2} />
          </div>
          <p className="text-base font-medium text-ink-50">
            {isDragActive
              ? "Drop your file here"
              : "Drag & drop a file, or click to browse"}
          </p>
          <p className="mt-1 text-sm text-ink-400">
            Supports .txt, .csv, .pdf, .jpg, .png, and .webp — up to 25 MB
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-ink-700 bg-ink-900/50 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal-400/15 text-signal-400">
                <FileIcon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-50">
                  {uploadedFile.file.name}
                </p>
                <p className="text-xs text-ink-400">
                  {formatBytes(uploadedFile.file.size)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUploadedFile(null)}
              className="shrink-0 rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-50"
              aria-label="Remove file"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onContinue(uploadedFile)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-signal-400 active:scale-[0.98]"
          >
            Continue
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}
    </StepLayout>
  );
}
