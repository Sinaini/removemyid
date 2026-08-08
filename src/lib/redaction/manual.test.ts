import { describe, it, expect } from "vitest";
import { resolveManualSpans } from "./manual";
import { redactText, REDACTED } from "./redact";
import { defaultRedactionOptions } from "./options";
import type { ManualSpan, PIICategory, RedactionOptions } from "../../types";

let counter = 0;
function span(partial: Partial<ManualSpan> & { text: string }): ManualSpan {
  return {
    id: `m${++counter}`,
    page: 0,
    start: 0,
    end: partial.text.length,
    scope: "occurrence",
    ...partial,
  };
}

/** Detectors off, so only the manual spans act. */
function noDetectors(): RedactionOptions {
  const options = defaultRedactionOptions();
  for (const key of Object.keys(options) as PIICategory[]) {
    if (key !== "manual") options[key] = { ...options[key], enabled: false };
  }
  return options;
}

describe("resolveManualSpans", () => {
  const text = "Project Orion is led by Kim, contact Kim for details.";

  it("uses the recorded offsets when the text still matches", () => {
    const start = text.indexOf("Orion");
    const result = resolveManualSpans(text, [
      span({ text: "Orion", start, end: start + 5 }),
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ category: "manual", start });
  });

  // The offsets can drift — OCR is not guaranteed to produce identical text on a
  // re-run — so a stale span falls back to finding its text rather than being
  // applied to whatever now sits at those offsets.
  it("falls back to the first occurrence when the offsets have shifted", () => {
    const result = resolveManualSpans(text, [span({ text: "Orion", start: 0, end: 5 })]);
    expect(result.matches).toHaveLength(1);
    expect(text.slice(result.matches[0].start, result.matches[0].end)).toBe("Orion");
  });

  // Silently dropping a span the user explicitly asked for would remove coverage
  // without telling anyone.
  it("reports a span whose text is gone as unresolved rather than dropping it", () => {
    const result = resolveManualSpans(text, [span({ text: "Vanished" })]);
    expect(result.matches).toHaveLength(0);
    expect(result.unresolvedIds).toEqual(["m3"]);
  });

  it("redacts only one occurrence in occurrence scope", () => {
    const start = text.indexOf("Kim");
    const result = resolveManualSpans(text, [
      span({ text: "Kim", start, end: start + 3 }),
    ]);
    expect(result.matches).toHaveLength(1);
  });

  it("redacts every occurrence in all scope", () => {
    const result = resolveManualSpans(text, [span({ text: "Kim", scope: "all" })]);
    expect(result.matches).toHaveLength(2);
  });

  // Reuses the same word-boundary logic as the exact-value fields, so a short
  // marked word can't shred the document.
  it("does not match inside a longer word in all scope", () => {
    const result = resolveManualSpans("Alabama is a state", [
      span({ text: "Al", scope: "all" }),
    ]);
    expect(result.matches).toHaveLength(0);
  });

  it("ignores a whitespace-only selection", () => {
    expect(resolveManualSpans(text, [span({ text: "   " })]).matches).toHaveLength(0);
  });

  describe("page scoping", () => {
    it("applies an occurrence span only to its own page", () => {
      const s = span({ text: "Orion", page: 3, start: 8, end: 13 });
      expect(resolveManualSpans(text, [s], 3).matches).toHaveLength(1);
      expect(resolveManualSpans(text, [s], 2).matches).toHaveLength(0);
    });

    it("applies an unscoped all-occurrences span to every page", () => {
      const s = span({ text: "Kim", scope: "all", page: 0 });
      expect(resolveManualSpans(text, [s], 5).matches).toHaveLength(2);
    });
  });
});

describe("manual spans in the pipeline", () => {
  const text = "Codename Orion, budget 4.2m, lead Kim.";

  it("redacts a span the detectors would never have found", () => {
    const start = text.indexOf("Orion");
    const result = redactText(text, noDetectors(), undefined, "redacted", [
      span({ text: "Orion", start, end: start + 5 }),
    ]);
    expect(result.redactedText).toBe(`Codename ${REDACTED}, budget 4.2m, lead Kim.`);
  });

  it("counts and labels manual spans in the summary", () => {
    const result = redactText(text, noDetectors(), undefined, "redacted", [
      span({ text: "Orion", start: text.indexOf("Orion"), end: text.indexOf("Orion") + 5 }),
    ]);
    expect(result.summary.counts.manual).toBe(1);
    expect(result.summary.items[0].category).toBe("manual");
  });

  it("lets a manual span win over an overlapping detected match", () => {
    // The detector would call this an email; the user marked a wider span.
    const source = "write to jane@acme.com today";
    const result = redactText(
      source,
      defaultRedactionOptions(),
      undefined,
      "redacted",
      [span({ text: "to jane@acme.com", start: 6, end: 22 })]
    );
    expect(result.redactedText).toBe(`write ${REDACTED} today`);
  });

  it("takes part in pseudonym numbering like any other category", () => {
    const result = redactText(text, noDetectors(), undefined, "pseudonym", [
      span({ text: "Orion", scope: "all" }),
    ]);
    expect(result.redactedText).toContain("[REDACTED_1]");
  });

  it("can be excluded again, so marking is not one-way", () => {
    const spans = [span({ text: "Orion", scope: "all" })];
    const first = redactText(text, noDetectors(), undefined, "redacted", spans);
    const id = first.summary.items[0].id;

    const after = redactText(text, noDetectors(), new Set([id]), "redacted", spans);
    expect(after.redactedText).toBe(text);
  });
});
