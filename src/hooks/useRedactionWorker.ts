import { useCallback, useEffect, useRef } from "react";
import type {
  RedactionOptions,
  RedactionRequest,
  RedactionResponse,
  RedactionResult,
} from "../types";

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

    worker.onmessage = (event: MessageEvent<RedactionResponse>) => {
      const response = event.data;
      const pending = pendingRef.current.get(response.requestId);
      if (!pending) return;
      pendingRef.current.delete(response.requestId);

      if (response.ok) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error));
      }
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  const redact = useCallback(
    (text: string, options?: RedactionOptions): Promise<RedactionResult> => {
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("Redaction worker is not ready"));
          return;
        }

        const requestId = crypto.randomUUID();
        pendingRef.current.set(requestId, { resolve, reject });

        const request: RedactionRequest = { requestId, text, options };
        worker.postMessage(request);
      });
    },
    []
  );

  return { redact };
}
