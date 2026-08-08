import { describe, it, expect } from "vitest";
import { redactText, findAllMatches, REDACTED } from "./redact";
import { defaultRedactionOptions } from "./options";
import { ALL_CATEGORIES } from "./registry";
import type { PIICategory, RedactionOptions } from "../../types";

// One named test per bug confirmed during the audit. Each was reproduced
// against the code as it shipped, so a failure here means a real regression
// rather than a style disagreement.

/** Options with only the listed categories enabled — keeps a case focused. */
function only(...categories: PIICategory[]): RedactionOptions {
  const options = defaultRedactionOptions();
  for (const category of ALL_CATEGORIES) {
    options[category] = { ...options[category], enabled: categories.includes(category) };
  }
  return options;
}

/**
 * Only `category` enabled, narrowed to `exactValue`. Isolating the category
 * matters: leaving the others on means an unrelated detector can redact the
 * fixture for its own valid reasons (compromise legitimately tags "Alabama" as
 * a place) and the test stops measuring what it claims to.
 */
function withValues(category: PIICategory, exactValue: string): RedactionOptions {
  const options = only(category);
  options[category] = { ...options[category], exactValue };
  return options;
}

/** Every offset flagged by any match, for leak assertions. */
function covered(text: string, options?: RedactionOptions): Set<number> {
  const set = new Set<number>();
  for (const match of findAllMatches(text, options)) {
    for (let i = match.start; i < match.end; i++) set.add(i);
  }
  return set;
}

function categoryOf(
  text: string,
  needle: string,
  options?: RedactionOptions
): PIICategory | undefined {
  return findAllMatches(text, options).find((m) => m.text === needle)?.category;
}

describe("overlap resolution", () => {
  it("leaves no unredacted tail when matches partially overlap", () => {
    // Verified leak: an email span and an NLP person span that starts inside it
    // and extends past it. The person span used to be discarded entirely.
    const text = "jane@acme.com Jane Doe of Springfield General";
    const out = redactText(text).redactedText;
    expect(out).not.toContain("jane@acme.com");
    expect(out).not.toContain("Jane Doe");
  });

  it("never lets a short later match reset the coverage watermark", () => {
    const text = "Contact Jane Doe, born 01/02/1990, aged 34, at jane@acme.com";
    const out = redactText(text).redactedText;
    for (const secret of ["Jane Doe", "01/02/1990", "jane@acme.com"]) {
      expect(out, secret).not.toContain(secret);
    }
  });

  it("lets a precise category win over a longer NLP span at the same offset", () => {
    // Priority now sorts before length. Previously the longer person span won
    // and the value was reported as a name.
    const text = "jane@acme.com";
    expect(categoryOf(text, "jane@acme.com")).toBe("email");
  });
});

describe("credit card span", () => {
  it("does not swallow the separator that follows the number", () => {
    const text = "Card 4111 1111 1111 1111 exp 12/26";
    const result = redactText(text, only("creditCard"));
    // Previously produced "Card [REDACTED]exp ..." because the trailing space
    // was inside the match span.
    expect(result.redactedText).toBe(`Card ${REDACTED} exp 12/26`);
    expect(result.summary.items[0].text).toBe("4111 1111 1111 1111");
  });

  it("does not swallow a trailing dash", () => {
    const text = "acct 4111-1111-1111-1111-x";
    const result = redactText(text, only("creditCard"));
    expect(result.summary.items[0].text).toBe("4111-1111-1111-1111");
    expect(result.redactedText).toContain("-x");
  });
});

describe("long digit runs that previously leaked entirely", () => {
  // Both of these were written to the output in the clear: the card detector
  // rejected them on checksum/length, and the phone detector had already
  // consumed the span and rejected it too.
  it("redacts a 16-digit number that fails the Luhn check", () => {
    const text = "Card 4111111111111112 here";
    const out = redactText(text).redactedText;
    expect(out).not.toContain("4111111111111112");
  });

  it("redacts a 20-digit run", () => {
    const text = "ref 12345678901234567890 end";
    const out = redactText(text).redactedText;
    expect(out).not.toContain("12345678901234567890");
  });

  it("covers every digit of a non-Luhn run, not just part of it", () => {
    const text = "1234567890123456";
    const set = covered(text);
    for (let i = 0; i < text.length; i++) {
      expect(set.has(i), `digit at ${i} left visible`).toBe(true);
    }
  });

  it("still labels a valid card as a card rather than a long number", () => {
    expect(categoryOf("4111 1111 1111 1111", "4111 1111 1111 1111")).toBe("creditCard");
  });
});

describe("phone boundaries", () => {
  it("does not match the digit tail of an alphanumeric identifier", () => {
    // "ID AB1234567890" produced "ID AB[REDACTED]".
    const matches = findAllMatches("ID AB1234567890", only("phone"));
    expect(matches).toHaveLength(0);
  });

  it("still matches a normally formatted number", () => {
    const matches = findAllMatches("call +1 (415) 555-2671 now", only("phone"));
    expect(matches).toHaveLength(1);
    expect(matches[0].text.replace(/\D/g, "")).toBe("14155552671");
  });

  it("does not stitch digits across a line break into one number", () => {
    const matches = findAllMatches("row1 12\n34 56 78 90", only("phone"));
    for (const match of matches) {
      expect(match.text).not.toContain("\n");
    }
  });

  it("does not treat a spaced-out list of single digits as a phone number", () => {
    expect(findAllMatches("values 1 2 3 4 5 6 7 8", only("phone"))).toHaveLength(0);
  });
});

describe("dot-separated dates", () => {
  it("classifies 01.01.1990 as a date, not a phone number", () => {
    expect(categoryOf("dob 01.01.1990", "01.01.1990")).toBe("date");
  });

  it("means the Dates toggle actually controls it", () => {
    // The real symptom of the mislabelling: unticking Dates left the value
    // redacted anyway (as a phone), and unticking Phone could expose it.
    const withDates = redactText("dob 01.01.1990", only("date")).redactedText;
    expect(withDates).not.toContain("01.01.1990");

    const noDates = redactText("dob 01.01.1990", only("phone")).redactedText;
    expect(noDates).toContain("01.01.1990");
  });

  it("still treats a real dotted phone number as a phone number", () => {
    expect(categoryOf("call 054.399.0303", "054.399.0303")).toBe("phone");
  });
});

describe("SSN validation", () => {
  const invalid = [
    "000-45-6789",
    "666-45-6789",
    "900-45-6789",
    "123-00-6789",
    "123-45-0000",
  ];

  for (const value of invalid) {
    it(`rejects the never-issued SSN ${value}`, () => {
      expect(findAllMatches(value, only("ssn"))).toHaveLength(0);
    });
  }

  it("accepts a valid hyphenated SSN", () => {
    const matches = findAllMatches("ssn 123-45-6789", only("ssn"));
    expect(matches.map((m) => m.text)).toContain("123-45-6789");
  });

  it("accepts a space-separated SSN", () => {
    expect(findAllMatches("123 45 6789", only("ssn"))).toHaveLength(1);
  });

  it("rejects a mixed-separator SSN", () => {
    expect(findAllMatches("123-45 6789", only("ssn"))).toHaveLength(0);
  });

  it("reads a bare nine-digit number as an SSN when the label says so", () => {
    const matches = findAllMatches("SSN: 123456789", only("ssn"));
    expect(matches.map((m) => m.text)).toContain("123456789");
  });

  it("still redacts a bare nine-digit number even without a label", () => {
    expect(redactText("value 123456789").redactedText).not.toContain("123456789");
  });
});

describe("age labels", () => {
  it("does not read a duration as an age", () => {
    expect(findAllMatches("aged 7 days", only("age"))).toHaveLength(0);
    expect(findAllMatches("age: 3 weeks", only("age"))).toHaveLength(0);
  });

  it("still reads an explicit age", () => {
    expect(findAllMatches("aged 42", only("age")).map((m) => m.text)).toEqual(["42"]);
    expect(findAllMatches("aged 42 years", only("age")).map((m) => m.text)).toEqual([
      "42",
    ]);
  });

  it("does not fire on unrelated words ending in 'age'", () => {
    for (const text of ["page 12", "average 87", "Storage 5"]) {
      expect(findAllMatches(text, only("age")), text).toHaveLength(0);
    }
  });
});

describe("dates without a year", () => {
  it("finds a month-and-day date", () => {
    const matches = findAllMatches("born January 5 in the clinic", only("date"));
    expect(matches.map((m) => m.text)).toContain("January 5");
  });

  it("finds a day-and-month date", () => {
    const matches = findAllMatches("admitted 5 March for review", only("date"));
    expect(matches.map((m) => m.text)).toContain("5 March");
  });

  it("still finds a full date with a year", () => {
    const matches = findAllMatches("on March 3rd, 1990 he", only("date"));
    expect(matches.map((m) => m.text)).toContain("March 3rd, 1990");
  });

  it("does not fire on 'May' used as a verb", () => {
    expect(findAllMatches("May I ask about this", only("date"))).toHaveLength(0);
  });
});

describe("user-supplied exact values", () => {
  it("does not match a name fragment inside unrelated words", () => {
    // The worst over-redaction in the codebase: person value "Al Green" turned
    // "Alabama is green with algae" into "[REDACTED]abama is [REDACTED] with
    // [REDACTED]gae".
    const text = "Alabama is green with algae";
    const result = redactText(text, withValues("person", "Al Green"));
    expect(result.redactedText).toBe(text);
  });

  it("still matches the full typed name", () => {
    const result = redactText("Patient Al Green attended", withValues("person", "Al Green"));
    expect(result.redactedText).toBe(`Patient ${REDACTED} attended`);
  });

  it("matches a name across a line wrap", () => {
    const result = redactText("Al\nGreen attended", withValues("person", "Al Green"));
    expect(result.redactedText).toBe(`${REDACTED} attended`);
  });

  it("does not match a name written in reverse word order", () => {
    // Deliberately removed: nobody writes names or addresses backwards, and it
    // was a large false-positive source.
    const text = "Green Al is a colour";
    expect(redactText(text, withValues("person", "Al Green")).redactedText).toBe(text);
  });

  it("does not treat spaced-out digits as the typed number", () => {
    const text = "order 1 2 3 4 5 6 shipped";
    expect(redactText(text, withValues("phone", "123456")).redactedText).toBe(text);
  });

  it("does not stitch the typed number across line breaks", () => {
    const text = "a 1\n2\n3\n4\n5\n6 b";
    expect(redactText(text, withValues("phone", "123456")).redactedText).toBe(text);
  });

  it("does not start or end a match inside a longer digit run", () => {
    // Typing "1234567" against "total 91234567": the old greedy country-code
    // prefix produced "91234", a partial redaction of a longer number that the
    // summary nonetheless reported as complete.
    const text = "total 91234567";
    const runStart = text.indexOf("91234567");
    const runEnd = runStart + "91234567".length;

    for (const match of findAllMatches(text, withValues("phone", "1234567"))) {
      // Any match must cover the whole digit run or stay outside it entirely.
      const startsInside = match.start > runStart && match.start < runEnd;
      const endsInside = match.end > runStart && match.end < runEnd;
      expect(startsInside, `match starts mid-run: ${match.text}`).toBe(false);
      expect(endsInside, `match ends mid-run: ${match.text}`).toBe(false);
    }
  });

  it("matches a typed phone number regardless of its formatting in the file", () => {
    const result = redactText("call 054-399-0303 today", withValues("phone", "0543990303"));
    expect(result.redactedText).toBe(`call ${REDACTED} today`);
  });

  it("splits a comma-separated list into independent values", () => {
    const result = redactText(
      "Al Green and Jane Roe attended",
      withValues("person", "Al Green, Jane Roe")
    );
    expect(result.redactedText).toBe(`${REDACTED} and ${REDACTED} attended`);
  });
});

describe("redaction output shape", () => {
  it("keeps summary item text in sync with what was removed", () => {
    const text = "Jane Doe, jane@acme.com, 054-399-0303, 4111 1111 1111 1111";
    const { redactedText, summary } = redactText(text);
    for (const item of summary.items) {
      expect(text.slice(item.start, item.end)).toBe(item.text);
      expect(redactedText).not.toContain(item.text);
    }
  });

  it("reports a total matching the number of items", () => {
    const { summary } = redactText("jane@acme.com and john@acme.com");
    expect(summary.total).toBe(summary.items.length);
    expect(summary.counts.email).toBe(2);
  });

  it("leaves text with no PII untouched", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    expect(redactText(text, only("email", "phone", "creditCard")).redactedText).toBe(text);
  });
});
