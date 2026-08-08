// Text decoding.
//
// `File.prototype.text()` always assumes UTF-8. A CSV exported from Excel on a
// Hebrew or Western-European Windows machine is usually Windows-1255 or
// Windows-1252, and decoding those as UTF-8 produces mojibake — which then also
// breaks detection, because the detectors never see the real characters.
//
// Every decoder used here is built into the browser, so this costs no bundle
// size at all.

export type TextEncodingId =
  | "utf-8"
  | "utf-16le"
  | "utf-16be"
  | "windows-1252"
  | "windows-1255";

export interface DecodedText {
  text: string;
  encoding: TextEncodingId;
  /** The input carried a byte-order mark, which is re-emitted on output. */
  hadBom: boolean;
  /** True when the encoding was inferred rather than declared by a BOM. */
  guessed: boolean;
}

export const ENCODING_LABELS: Record<TextEncodingId, string> = {
  "utf-8": "Unicode (UTF-8)",
  "utf-16le": "Unicode (UTF-16, little-endian)",
  "utf-16be": "Unicode (UTF-16, big-endian)",
  "windows-1252": "Western European (Windows-1252)",
  "windows-1255": "Hebrew (Windows-1255)",
};

const UTF8_BOM = [0xef, 0xbb, 0xbf];

export async function decodeTextFile(
  file: File,
  forced?: TextEncodingId
): Promise<DecodedText> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (forced) {
    return {
      text: decode(bytes, forced),
      encoding: forced,
      hadBom: hasUtf8Bom(bytes),
      guessed: false,
    };
  }

  // A BOM is a declaration, not a guess.
  if (hasUtf8Bom(bytes)) {
    return {
      text: decode(bytes.subarray(3), "utf-8"),
      encoding: "utf-8",
      hadBom: true,
      guessed: false,
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decode(bytes.subarray(2), "utf-16le"), encoding: "utf-16le", hadBom: true, guessed: false };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decode(bytes.subarray(2), "utf-16be"), encoding: "utf-16be", hadBom: true, guessed: false };
  }

  // No BOM. Try strict UTF-8 first: valid UTF-8 is overwhelmingly the common
  // case, and `fatal: true` makes it self-verifying — invalid sequences throw
  // rather than silently becoming replacement characters.
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
      hadBom: false,
      guessed: false,
    };
  } catch {
    const encoding = guessLegacyEncoding(bytes);
    return { text: decode(bytes, encoding), encoding, hadBom: false, guessed: true };
  }
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return UTF8_BOM.every((byte, i) => bytes[i] === byte);
}

function decode(bytes: Uint8Array, encoding: TextEncodingId): string {
  // Non-fatal here: by this point we have committed to an encoding, and a
  // replacement character is better than refusing to process the file.
  return new TextDecoder(encoding).decode(bytes);
}

/**
 * Not valid UTF-8, so it is a legacy single-byte encoding. Hebrew text in
 * Windows-1255 concentrates its high bytes in 0xE0-0xFA (the alphabet);
 * Windows-1252 spreads them across the accented-Latin range. Counting which
 * region dominates distinguishes the two well enough to be worth doing, and the
 * user can override it if we get it wrong.
 */
function guessLegacyEncoding(bytes: Uint8Array): TextEncodingId {
  let hebrewRange = 0;
  let otherHigh = 0;

  for (const byte of bytes) {
    if (byte < 0x80) continue;
    if (byte >= 0xe0 && byte <= 0xfa) hebrewRange += 1;
    else otherHigh += 1;
  }

  return hebrewRange > otherHigh ? "windows-1255" : "windows-1252";
}

/**
 * Encode back to bytes. Output is always UTF-8 — `TextEncoder` cannot produce
 * anything else, and writing a legacy encoding would need a hand-rolled table
 * for no real benefit. The BOM is preserved when the input had one, because
 * Excel relies on it to open a UTF-8 CSV correctly.
 */
export function encodeText(text: string, hadBom: boolean): Blob {
  const body = new TextEncoder().encode(text);
  if (!hadBom) return new Blob([body], { type: "text/plain;charset=utf-8" });

  const withBom = new Uint8Array(body.length + 3);
  withBom.set(UTF8_BOM, 0);
  withBom.set(body, 3);
  return new Blob([withBom], { type: "text/plain;charset=utf-8" });
}
