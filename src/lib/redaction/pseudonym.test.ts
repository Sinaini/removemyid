import { describe, it, expect } from "vitest";
import { createPseudonymBook, replacementFor, REDACTED } from "./pseudonym";
import { redactText, createRedactionContext, matchId, findAllMatches } from "./redact";
import { defaultRedactionOptions } from "./options";
import type { PIICategory, RedactionOptions } from "../../types";

const match = (category: PIICategory, text: string) => ({
  category,
  text,
  start: 0,
  end: text.length,
});

function only(...categories: PIICategory[]): RedactionOptions {
  const options = defaultRedactionOptions();
  for (const key of Object.keys(options) as PIICategory[]) {
    options[key] = { ...options[key], enabled: categories.includes(key) };
  }
  return options;
}

describe("pseudonym book", () => {
  it("gives the same value the same token every time", () => {
    const book = createPseudonymBook();
    expect(book.tokenFor("person", "Jane Doe")).toBe("[PERSON_1]");
    expect(book.tokenFor("person", "Jane Doe")).toBe("[PERSON_1]");
  });

  it("gives different values different tokens", () => {
    const book = createPseudonymBook();
    expect(book.tokenFor("person", "Jane Doe")).toBe("[PERSON_1]");
    expect(book.tokenFor("person", "John Roe")).toBe("[PERSON_2]");
  });

  it("counts per category, so categories do not share a sequence", () => {
    const book = createPseudonymBook();
    expect(book.tokenFor("person", "Jane")).toBe("[PERSON_1]");
    expect(book.tokenFor("email", "j@x.co")).toBe("[EMAIL_1]");
    expect(book.tokenFor("person", "John")).toBe("[PERSON_2]");
  });

  it("collapses formatting differences for numbers", () => {
    const book = createPseudonymBook();
    const a = book.tokenFor("phone", "054-399-0303");
    expect(book.tokenFor("phone", "0543990303")).toBe(a);
    expect(book.tokenFor("phone", "(054) 399 0303")).toBe(a);
  });

  it("collapses case and whitespace for names", () => {
    const book = createPseudonymBook();
    const a = book.tokenFor("person", "Jane Doe");
    expect(book.tokenFor("person", "jane  doe")).toBe(a);
  });

  it("does not merge the same text across different categories", () => {
    const book = createPseudonymBook();
    expect(book.tokenFor("person", "Springfield")).not.toBe(
      book.tokenFor("place", "Springfield")
    );
  });
});

describe("replacementFor", () => {
  const book = createPseudonymBook();

  it("defaults to the literal placeholder", () => {
    expect(replacementFor(match("email", "a@b.co"), "redacted", book)).toBe(REDACTED);
  });

  it("renders the category in label mode", () => {
    expect(replacementFor(match("email", "a@b.co"), "label", book)).toBe("[EMAIL]");
    expect(replacementFor(match("person", "Jane"), "label", book)).toBe("[NAME]");
  });

  it("renders a stable token in pseudonym mode", () => {
    const fresh = createPseudonymBook();
    expect(replacementFor(match("person", "Jane"), "pseudonym", fresh)).toBe("[PERSON_1]");
    expect(replacementFor(match("person", "Jane"), "pseudonym", fresh)).toBe("[PERSON_1]");
  });
});

describe("redactText — replacement modes", () => {
  const text = "Contact Jane Doe at jane@acme.com or John Roe at john@acme.com";

  it("uses [REDACTED] by default", () => {
    expect(redactText(text, only("email")).redactedText).toContain(REDACTED);
  });

  it("uses category labels in label mode", () => {
    const out = redactText(text, only("email"), undefined, "label").redactedText;
    expect(out).toContain("[EMAIL]");
    expect(out).not.toContain(REDACTED);
  });

  it("maps repeated values to the same token in pseudonym mode", () => {
    const repeated = "jane@acme.com wrote; reply to jane@acme.com or john@acme.com";
    const out = redactText(repeated, only("email"), undefined, "pseudonym").redactedText;
    expect(out).toBe("[EMAIL_1] wrote; reply to [EMAIL_1] or [EMAIL_2]");
  });

  it("keeps the summary in step with the file", () => {
    const result = redactText(text, only("email"), undefined, "pseudonym");
    for (const item of result.summary.items) {
      expect(result.redactedText).toContain(item.replacement);
    }
  });

  // The stability property. The pipeline re-runs on every exclusion, so tokens
  // must not depend on what is currently excluded — otherwise un-redacting one
  // value would silently renumber every other token on screen.
  it("does not renumber surviving tokens when an item is excluded", () => {
    const repeated = "a@x.co then b@x.co then c@x.co";
    const first = redactText(repeated, only("email"), undefined, "pseudonym");

    const second = first.summary.items[1];
    const after = redactText(
      repeated,
      only("email"),
      new Set([second.id]),
      "pseudonym"
    );

    const tokenFor = (result: typeof first, index: number) =>
      result.summary.items.find((item) => item.text === `${"abc"[index]}@x.co`)
        ?.replacement;

    expect(tokenFor(after, 0)).toBe(tokenFor(first, 0));
    expect(tokenFor(after, 2)).toBe(tokenFor(first, 2));
    // And the excluded value's number is simply absent, not reused.
    expect(after.redactedText).toContain("b@x.co");
    expect(after.redactedText).not.toContain("[EMAIL_2]");
  });

  it("produces byte-identical output when run twice", () => {
    const a = redactText(text, only("email", "person"), undefined, "pseudonym");
    const b = redactText(text, only("email", "person"), undefined, "pseudonym");
    expect(a.redactedText).toBe(b.redactedText);
  });
});

describe("createRedactionContext — document scope", () => {
  // A PDF detects page by page. Without a shared book the same person would be
  // [PERSON_1] independently on every page.
  it("gives the same value the same token across pages", () => {
    const context = createRedactionContext("pseudonym");
    const options = only("email");

    const page1 = findAllMatches("write to jane@acme.com", options);
    const page2 = findAllMatches("cc jane@acme.com and bob@acme.com", options);

    context.register(page1);
    const summary1 = context.summarize(page1, 1);
    context.register(page2);
    const summary2 = context.summarize(page2, 2);

    const janeOnPage1 = summary1.items[0].replacement;
    const janeOnPage2 = summary2.items.find((i) => i.text === "jane@acme.com")
      ?.replacement;

    expect(janeOnPage2).toBe(janeOnPage1);
    expect(summary2.items.find((i) => i.text === "bob@acme.com")?.replacement).not.toBe(
      janeOnPage1
    );
  });

  it("keeps ids distinct across pages", () => {
    const context = createRedactionContext("label");
    const matches = findAllMatches("jane@acme.com", only("email"));
    const a = context.summarize(matches, 1).items[0].id;
    const b = context.summarize(matches, 2).items[0].id;
    expect(a).not.toBe(b);
  });

  it("keeps ids distinct between the text layer and OCR on one page", () => {
    // Both passes read the same page but in different coordinate spaces; sharing
    // an id would let excluding one silently un-redact the other.
    const context = createRedactionContext("redacted");
    const matches = findAllMatches("jane@acme.com", only("email"));
    expect(context.summarize(matches, 1, "text").items[0].id).not.toBe(
      context.summarize(matches, 1, "ocr").items[0].id
    );
  });
});

describe("matchId", () => {
  it("encodes page, source, category and span", () => {
    expect(matchId({ category: "email", start: 3, end: 9 }, 2, "ocr")).toBe(
      "2:ocr:email:3:9"
    );
  });

  it("is unique across a mixed set of matches", () => {
    const text = "Jane Doe, jane@acme.com, 054-399-0303, 4111 1111 1111 1111";
    const ids = redactText(text).summary.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
