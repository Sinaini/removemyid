// The async Clipboard API is undefined on non-secure origins (plain http on a
// LAN address, which is exactly how someone self-hosting this offline would
// reach it) and can reject on permission grounds even where it exists. An
// unguarded `navigator.clipboard.writeText` therefore throws an unhandled
// rejection and the button appears to do nothing.
//
// Returns false rather than throwing, so callers can fall back to showing the
// value for manual copying.
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  return legacyCopy(value);
}

// execCommand("copy") is deprecated but remains the only copy mechanism on
// insecure origins and older WebKit. It requires the text to be in a focused,
// selected, on-screen element — hence the off-viewport textarea rather than
// `display: none`, which browsers refuse to select from.
function legacyCopy(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
