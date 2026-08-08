/**
 * Scan `text` with `regex`, letting the caller accept or reject each candidate.
 *
 * The important detail is what happens on rejection. `String.prototype.matchAll`
 * always advances past the whole candidate, so a validator that says "no" makes
 * the scanner skip that text entirely and never consider a shorter match inside
 * it. That produced a verified leak: in "Card 4111111111111112", the credit-card
 * pattern matched all 16 digits and rejected them on Luhn, the phone pattern
 * matched the same run and rejected it for being longer than 15 digits, and the
 * number was written to the output completely unredacted.
 *
 * Retrying one character to the right instead means a rejected candidate can
 * never swallow the text around it. Cost is O(n·k) with k the maximum candidate
 * length (a few dozen characters for every pattern here), which is bounded.
 *
 * Every checksum-gated detector — Luhn, IBAN mod-97, ABA, the Israeli ID check
 * digit — depends on this. See CONTRIBUTING.md before adding another.
 */
export function execAll(
  regex: RegExp,
  text: string,
  onMatch: (match: RegExpExecArray) => boolean
): void {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const scanner = new RegExp(regex.source, flags);

  let match: RegExpExecArray | null;
  while ((match = scanner.exec(text)) !== null) {
    const accepted = onMatch(match);
    scanner.lastIndex = accepted ? match.index + match[0].length : match.index + 1;
    // A zero-length match would otherwise spin forever.
    if (match[0].length === 0) scanner.lastIndex = match.index + 1;
  }
}
