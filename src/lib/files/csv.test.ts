import { describe, it, expect } from "vitest";
import { parseCsv, detectDelimiter, csvTextView, serializeCsv } from "./csv";
import { viewRangeToSource } from "../pipeline/offsetMap";

describe("detectDelimiter", () => {
  it("finds a comma", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("finds a semicolon in a European export", () => {
    expect(detectDelimiter("naam;email;telefoon\nJan;j@x.nl;0612345678")).toBe(";");
  });

  it("finds a tab", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("is not fooled by prose containing commas", () => {
    // One line, no consistent field structure — must not report a delimiter that
    // would then shred the text.
    expect(detectDelimiter("Hello, world. This is, in fact, prose.")).toBe(",");
  });

  it("ignores delimiters inside quoted fields when counting", () => {
    // Every row has 2 fields; the comma inside the quotes must not count.
    expect(detectDelimiter('"Smith, John";x\n"Doe, Jane";y')).toBe(";");
  });
});

describe("parseCsv", () => {
  it("splits simple rows and columns", () => {
    const doc = parseCsv("a,b\n1,2");
    expect(doc.rows).toBe(2);
    expect(doc.cells.map((c) => c.value)).toEqual(["a", "b", "1", "2"]);
  });

  it("keeps a comma inside a quoted field as part of the value", () => {
    const doc = parseCsv('"Smith, John",042-1234');
    expect(doc.cells.map((c) => c.value)).toEqual(["Smith, John", "042-1234"]);
  });

  it("resolves doubled quotes to a single quote", () => {
    const doc = parseCsv('"Notes ""quoted"" here",x');
    expect(doc.cells[0].value).toBe('Notes "quoted" here');
  });

  it("handles CRLF line endings and records them", () => {
    const doc = parseCsv("a,b\r\n1,2");
    expect(doc.eol).toBe("\r\n");
    expect(doc.cells.map((c) => c.value)).toEqual(["a", "b", "1", "2"]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c").cells.map((c) => c.value)).toEqual(["a", "", "c"]);
  });

  it("keeps a newline inside a quoted field", () => {
    const doc = parseCsv('"line1\nline2",x');
    expect(doc.cells[0].value).toBe("line1\nline2");
    expect(doc.rows).toBe(1);
  });

  it("gives each cell source offsets that slice back to its raw field", () => {
    const text = '"Smith, John",042-1234';
    const doc = parseCsv(text);
    expect(text.slice(doc.cells[0].start, doc.cells[0].end)).toBe('"Smith, John"');
    expect(text.slice(doc.cells[1].start, doc.cells[1].end)).toBe("042-1234");
  });
});

describe("csvTextView", () => {
  it("joins cells so the detectors see word boundaries, not delimiters", () => {
    const doc = parseCsv("Jane,Doe\nJohn,Roe");
    expect(csvTextView(doc).text).toBe("Jane Doe\nJohn Roe");
  });

  it("never maps a match offset onto a delimiter or a quote", () => {
    const doc = parseCsv('"Smith, John",jane@acme.com');
    const view = csvTextView(doc);
    // The whole view is field values only.
    expect(view.text).toBe("Smith, John jane@acme.com");
    // Offset of the joining space maps to no cell at all.
    expect(viewRangeToSource(view, 11, 12)).toEqual([]);
  });

  it("maps a view range back to the cell it came from", () => {
    const doc = parseCsv("Jane,jane@acme.com");
    const view = csvTextView(doc);
    const start = view.text.indexOf("jane@acme.com");
    const spans = viewRangeToSource(view, start, start + 13);
    expect(spans).toHaveLength(1);
    expect(spans[0].ref).toBe(1);
  });
});

describe("serializeCsv", () => {
  it("round-trips an unmodified document's structure", () => {
    const text = "a,b\n1,2";
    expect(serializeCsv(parseCsv(text), new Map())).toBe(text);
  });

  it("preserves the delimiter and line endings", () => {
    const text = "a;b\r\n1;2";
    expect(serializeCsv(parseCsv(text), new Map())).toBe(text);
  });

  // The bug this prevents: a replacement landing in a quoted field that used to
  // contain the delimiter. Inherited quoting would leave the row malformed.
  it("re-quotes a field whose new value contains the delimiter", () => {
    const doc = parseCsv("name,city\nJane,Springfield");
    const out = serializeCsv(doc, new Map([[2, "Doe, John"]]));
    expect(out).toBe('name,city\n"Doe, John",Springfield');
    // And the rebuilt document still has the same shape.
    expect(parseCsv(out).cells.map((c) => c.value)).toEqual([
      "name",
      "city",
      "Doe, John",
      "Springfield",
    ]);
  });

  it("drops quoting that is no longer needed", () => {
    const doc = parseCsv('"Smith, John",x');
    expect(serializeCsv(doc, new Map([[0, "REDACTED"]]))).toBe("REDACTED,x");
  });

  it("escapes a quote in a new value", () => {
    const doc = parseCsv("a,b");
    expect(serializeCsv(doc, new Map([[0, 'say "hi"']]))).toBe('"say ""hi""",b');
  });

  it("keeps the column count unchanged whatever the replacement", () => {
    const text = 'name,notes,email\n"Smith, John","a,b,c",j@x.co';
    const doc = parseCsv(text);
    const replaced = new Map([
      [3, "[REDACTED]"],
      [4, "x,y,z"],
      [5, "[REDACTED]"],
    ]);
    const out = serializeCsv(doc, replaced);
    const reparsed = parseCsv(out);
    expect(reparsed.cells.filter((c) => c.row === 1)).toHaveLength(3);
  });
});
