import { redactText } from "../lib/redaction/redact";
import type { RedactionRequest, RedactionResponse } from "../types";

self.onmessage = (event: MessageEvent<RedactionRequest>) => {
  const { requestId, text, options } = event.data;

  try {
    const result = redactText(text, options);
    const response: RedactionResponse = { requestId, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: RedactionResponse = {
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : "Unknown redaction error",
    };
    self.postMessage(response);
  }
};
