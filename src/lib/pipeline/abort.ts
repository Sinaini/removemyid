// Cancellation plumbing shared by every format handler.
//
// We use our own error class rather than `AbortSignal.throwIfAborted()`'s
// `DOMException`: a DOMException does not survive `postMessage` structured
// cloning with its `name` intact, and redaction runs partly inside a Web
// Worker. A cancellation that degrades into a generic error on the way back to
// the main thread would surface to the user as a red "something went wrong"
// card for an action they deliberately took.

export class CancelledError extends Error {
  override readonly name = "CancelledError";

  constructor(message = "Redaction was cancelled") {
    super(message);
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancelledError();
}

/**
 * True for both our own CancelledError and the platform's AbortError, so
 * callers can treat "the user cancelled" uniformly regardless of whether the
 * throw came from our loop guards or from an aborted browser API.
 */
export function isCancellation(error: unknown): boolean {
  if (error instanceof CancelledError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}
