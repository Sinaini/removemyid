import { describe, it, expect } from "vitest";
import { buildSegments } from "./segments";
import type { RedactedItem } from "../../types";

let n = 0;
function item(start: number, end: number, text: string): RedactedItem {
  return {
    id: `i${++n}`,
    category: "email",
    text,
    start,
    end,
    replacement: "[REDACTED]",
  };
}

/** Concatenating the segments must reproduce the document exactly. */
function reassemble(text: string, items: RedactedItem[]): string {
  return buildSegments(text, items)
    .map((s) => s.text)
    .join("");
}

describe("buildSegments", () => {
  const text = "Contact jane@acme.com or john@acme.com today";

  it("splits into plain and matched runs", () => {
    const segments = buildSegments(text, [item(8, 21, "jane@acme.com")]);
    expect(segments.map((s) => s.text)).toEqual([
      "Contact ",
      "jane@acme.com",
      " or john@acme.com today",
    ]);
    expect(segments[1].item).toBeDefined();
    expect(segments[0].item).toBeUndefined();
  });

  it("gives every segment the offset its text actually starts at", () => {
    for (const segment of buildSegments(text, [item(8, 21, "jane@acme.com")])) {
      expect(text.slice(segment.start, segment.end)).toBe(segment.text);
    }
  });

  it("handles a match at the very start and very end", () => {
    expect(reassemble("abcdef", [item(0, 3, "abc")])).toBe("abcdef");
    expect(reassemble("abcdef", [item(3, 6, "def")])).toBe("abcdef");
  });

  it("handles adjacent matches with no text between them", () => {
    const segments = buildSegments("abcdef", [item(0, 3, "abc"), item(3, 6, "def")]);
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.item)).toBe(true);
  });

  it("returns one plain segment when there are no matches", () => {
    const segments = buildSegments(text, []);
    expect(segments).toHaveLength(1);
    expect(segments[0].item).toBeUndefined();
  });

  it("returns nothing for empty text", () => {
    expect(buildSegments("", [])).toEqual([]);
  });

  // The summary can arrive merged across PDF pages, so order is not guaranteed.
  it("sorts items rather than trusting their order", () => {
    const segments = buildSegments(text, [
      item(25, 38, "john@acme.com"),
      item(8, 21, "jane@acme.com"),
    ]);
    expect(segments.filter((s) => s.item).map((s) => s.text)).toEqual([
      "jane@acme.com",
      "john@acme.com",
    ]);
  });

  it("drops an overlapping item rather than duplicating text", () => {
    expect(reassemble(text, [item(8, 21, "jane@acme.com"), item(10, 15, "ne@ac")])).toBe(
      text
    );
  });

  it("ignores an item whose span falls outside the text", () => {
    expect(reassemble("short", [item(100, 110, "nope")])).toBe("short");
  });

  it("ignores a zero-width item", () => {
    expect(buildSegments("abc", [item(1, 1, "")])).toHaveLength(1);
  });

  // The property that matters: the rendered view is always the whole document.
  it("property: segments always reassemble to the original text", () => {
    const source = "a@b.co and c@d.co and e@f.co plus trailing words";
    const cases: RedactedItem[][] = [
      [],
      [item(0, 6, "a@b.co")],
      [item(0, 6, "a@b.co"), item(11, 17, "c@d.co")],
      [item(11, 17, "c@d.co"), item(22, 28, "e@f.co")],
      [item(0, 6, "a@b.co"), item(11, 17, "c@d.co"), item(22, 28, "e@f.co")],
    ];
    for (const items of cases) {
      expect(reassemble(source, items)).toBe(source);
    }
  });
});
