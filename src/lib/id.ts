// crypto.randomUUID() isn't available on all mobile browsers (e.g. iOS Safari
// before 15.4, some in-app browsers) — fall back to a non-cryptographic but
// good-enough unique id for React keys / request correlation, neither of
// which need RFC4122 UUIDs specifically.
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
