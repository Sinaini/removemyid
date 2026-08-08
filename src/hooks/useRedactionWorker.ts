import { useCallback, useEffect, useRef } from "react";
import type {
  RedactionOptions,
  RedactionRequest,
  RedactionResponse,
  RedactionResult,
} from "../types";
import { generateId } from "../lib/id";
import { CancelledError } from "../lib/pipeline/abort";

interface PendingRequest {
  resolve: (result: RedactionResult) => void;
  reject: (error: Error) => void;
}

function rejectAll(pending: Map<string, PendingRequest>, error: Error): void {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

export function useRedactionWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/redaction.worker.ts", import.meta.url),
      { type: "module" }
    );
    const pending = pendingRef.current;

    worker.onmessage = (event: MessageEvent<RedactionResponse>) => {
      const response = event.data;
      const request = pending.get(response.requestId);
      if (!request) return;
      pending.delete(response.requestId);

      if (response.ok) {
        request.resolve(response.result);
      } else {
        request.reject(new Error(response.error));
      }
    };

    // An uncaught throw inside the worker fires `error` and never `message`,
    // so without this every in-flight promise hangs forever and the caller's
    // `isProcessing` sticks true with no error shown.
    worker.onerror = (event) => {
      rejectAll(
        pending,
        new Error(event.message || "The redaction worker crashed")
      );
    };

    workerRef.current = worker;

    return () => {
      // Terminating without settling the pending promises left their `await`s
      // permanently unresolved — navigating away mid-redaction wedged the UI
      // in a loading state that nothing could clear.
      rejectAll(pending, new CancelledError("Redaction worker was terminated"));
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const redact = useCallback(
    (
      text: string,
      options?: RedactionOptions,
      excludedIds?: string[]
    ): Promise<RedactionResult> => {
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("Redaction worker is not ready"));
          return;
        }

        const requestId = generateId();
        pendingRef.current.set(requestId, { resolve, reject });

        const request: RedactionRequest = { requestId, text, options, excludedIds };
        worker.postMessage(request);
      });
    },
    []
  );

  return { redact };
}
