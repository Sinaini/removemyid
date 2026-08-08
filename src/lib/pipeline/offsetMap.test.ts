import { describe, it, expect } from "vitest";
import { TextViewBuilder, viewRangeToSource } from "./offsetMap";

// Builds the shape every real consumer builds: fragments joined by glue.
function build(fragments: string[], separator = " ") {
  const b = new TextViewBuilder();
  let src = 0;
  fragments.forEach((fragment, i) => {
    if (i > 0) b.pushSeparator(separator);
    b.push(fragment, src, src + fragment.length, i);
    src += fragment.length;
  });
  return b.build();
}

describe("TextViewBuilder", () => {
  it("joins fragments with separators in the view text", () => {
    expect(build(["John", "Smith"]).text).toBe("John Smith");
  });

  it("keeps fragment view offsets equal to their slice bounds", () => {
    const view = build(["John", "Smith"]);
    for (const segment of view.segments) {
      expect(view.text.slice(segment.viewStart, segment.viewEnd)).toBe(
        segment.ref === 0 ? "John" : "Smith"
      );
    }
  });

  // The whole point of the separator/fragment split: glue must never be
  // attributed to a source range, or a box gets drawn over the gap.
  it("does not create segments for separators", () => {
    expect(build(["a", "b", "c"], "\n").segments).toHaveLength(3);
  });

  it("ignores empty fragments so no zero-width segments appear", () => {
    const b = new TextViewBuilder();
    b.push("", 0, 0, 0);
    b.push("x", 0, 1, 1);
    expect(b.build().segments).toHaveLength(1);
  });

  it("reports emptiness and current text for separator rules", () => {
    const b = new TextViewBuilder();
    expect(b.isEmpty).toBe(true);
    b.push("hi", 0, 2, 0);
    expect(b.isEmpty).toBe(false);
    expect(b.currentText).toBe("hi");
  });
});

describe("viewRangeToSource", () => {
  it("maps a range inside one fragment to fragment-local offsets", () => {
    const view = build(["John", "Smith"]);
    // "ohn" within "John"
    expect(viewRangeToSource(view, 1, 4)).toEqual([
      { ref: 0, srcStart: 0, srcEnd: 4, fragStart: 1, fragEnd: 4 },
    ]);
  });

  it("maps a range spanning a separator to both fragments", () => {
    const view = build(["John", "Smith"]);
    const spans = viewRangeToSource(view, 0, 10);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ ref: 0, fragStart: 0, fragEnd: 4 });
    expect(spans[1]).toMatchObject({ ref: 1, fragStart: 0, fragEnd: 5 });
  });

  it("excludes the separator itself from any fragment", () => {
    const view = build(["ab", "cd"]);
    // Offset 2 is the space; nothing should claim it.
    expect(viewRangeToSource(view, 2, 3)).toEqual([]);
  });

  it("returns nothing for a zero-width or inverted range", () => {
    const view = build(["ab", "cd"]);
    expect(viewRangeToSource(view, 1, 1)).toEqual([]);
    expect(viewRangeToSource(view, 3, 1)).toEqual([]);
  });

  it("does not drag in a fragment the range merely abuts", () => {
    const view = build(["ab", "cd"], "");
    // Range covers exactly "ab"; "cd" starts where it ends.
    expect(viewRangeToSource(view, 0, 2).map((s) => s.ref)).toEqual([0]);
  });

  it("finds the right fragments via binary search on a large view", () => {
    const fragments = Array.from({ length: 5000 }, (_, i) => `w${i}`);
    const view = build(fragments);
    const target = view.segments[4321];
    const spans = viewRangeToSource(view, target.viewStart, target.viewEnd);
    expect(spans).toHaveLength(1);
    expect(spans[0].ref).toBe(4321);
  });

  // The invariant that keeps a redaction box aligned: re-slicing the source
  // fragment with the returned fragment-local offsets must reproduce exactly
  // the view text that was matched.
  it("round-trips every span back to the matched view text", () => {
    const fragments = ["Contact", "Jane", "Doe", "at", "jane@acme.com"];
    const view = build(fragments);
    for (let start = 0; start < view.text.length; start++) {
      for (let end = start + 1; end <= view.text.length; end++) {
        const rebuilt = viewRangeToSource(view, start, end)
          .map((s) => fragments[s.ref].slice(s.fragStart, s.fragEnd))
          .join("");
        // Separators are dropped by design, so compare against the matched
        // text with its whitespace removed.
        expect(rebuilt).toBe(view.text.slice(start, end).replace(/ /g, ""));
      }
    }
  });
});
