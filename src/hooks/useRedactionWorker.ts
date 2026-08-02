import { useCallback, useEffect, useRef } from "react";
import type {
  RedactionOptions,
  RedactionRequest,
  RedactionResponse,
  RedactionResult,
} from "../types";
import { generateId } from "../lib/id";

interface PendingRequest {
  resolve: (result: RedactionResult) => void;
  reject: (error: Error) => void;
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

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.clear();
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
