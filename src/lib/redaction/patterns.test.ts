import { describe, it, expect } from "vitest";
import {
  findEmails,
  findPhones,
  findCreditCards,
  findAccountNumbers,
  findSSNs,
  findDates,
  findAges,
  maxDigitRun,
} from "./patterns";
import type { PIIMatch } from "../../types";

const texts = (matches: PIIMatch[]) => matches.map((m) => m.text);

/** Every match's span must agree with its text, or derived boxes misalign. */
function expectSpansConsistent(matches: PIIMatch[], text: string) {
  for (const match of matches) {
    expect(text.slice(match.start, match.end)).toBe(match.text);
  }
}

describe("findEmails", () => {
  it("finds plain and tagged addresses", () => {
    const text = "a@b.co, jane.doe+tag@sub.example.org";
    expect(texts(findEmails(text))).toEqual(["a@b.co", "jane.doe+tag@sub.example.org"]);
    expectSpansConsistent(findEmails(text), text);
  });

  it("ignores a bare domain and a lone @", () => {
    expect(findEmails("example.com and user @ host")).toHaveLength(0);
  });
});

describe("findPhones", () => {
  const positives = [
    "+1 (415) 555-2671",
    "054-3990303",
    "054-399-0303",
    "0543990303",
    "+972 54 399 0303",
    "(02) 6295 1234",
  ];

  for (const sample of positives) {
    it(`finds ${sample}`, () => {
      const text = `call ${sample} today`;
      const matches = findPhones(text);
      expect(matches).toHaveLength(1);
      expect(matches[0].text.trim()).toBe(sample);
      expectSpansConsistent(matches, text);
    });
  }

  it("rejects a number too short or too long to be a phone number", () => {
    expect(findPhones("12345")).toHaveLength(0);
    expect(findPhones("1234567890123456789")).toHaveLength(0);
  });

  it("rejects date shapes so they are never labelled phone numbers", () => {
    expect(findPhones("2024-01-15")).toHaveLength(0);
    expect(findPhones("01.01.1990")).toHaveLength(0);
  });
});

describe("findCreditCards", () => {
  it("accepts Luhn-valid test numbers in several groupings", () => {
    for (const sample of [
      "4111111111111111",
      "4111 1111 1111 1111",
      "4111-1111-1111-1111",
      "5500005555555559",
    ]) {
      expect(texts(findCreditCards(`card ${sample} ok`)), sample).toEqual([sample]);
    }
  });

  it("rejects a Luhn-invalid number", () => {
    expect(findCreditCards("4111111111111112")).toHaveLength(0);
  });

  it("excludes surrounding separators from the span", () => {
    const text = "Card 4111 1111 1111 1111 exp";
    expectSpansConsistent(findCreditCards(text), text);
    expect(texts(findCreditCards(text))).toEqual(["4111 1111 1111 1111"]);
  });
});

describe("findAccountNumbers", () => {
  it("catches long runs the card and phone detectors reject", () => {
    expect(texts(findAccountNumbers("ref 4111111111111112 x"))).toEqual([
      "4111111111111112",
    ]);
    expect(texts(findAccountNumbers("ref 12345678901234567890 x"))).toEqual([
      "12345678901234567890",
    ]);
  });

  it("ignores runs shorter than nine digits", () => {
    expect(findAccountNumbers("ref 12345678 x")).toHaveLength(0);
  });

  it("ignores dates, which can otherwise reach nine characters", () => {
    expect(findAccountNumbers("2024-01-15")).toHaveLength(0);
    expect(findAccountNumbers("01.01.1990")).toHaveLength(0);
  });
});

describe("findSSNs", () => {
  it("accepts a valid SSN and keeps the span tight", () => {
    const text = "ssn 123-45-6789.";
    expect(texts(findSSNs(text))).toContain("123-45-6789");
    expectSpansConsistent(findSSNs(text), text);
  });

  it("rejects never-issued area, group and serial values", () => {
    for (const sample of [
      "000-45-6789",
      "666-45-6789",
      "912-45-6789",
      "123-00-6789",
      "123-45-0000",
    ]) {
      expect(findSSNs(sample), sample).toHaveLength(0);
    }
  });
});

describe("findDates", () => {
  it("finds numeric, ISO and textual forms", () => {
    for (const sample of [
      "2024-01-15",
      "15/01/2024",
      "01.01.1990",
      "March 3rd, 1990",
      "3 March 1990",
      "January 5",
      "5 March",
    ]) {
      expect(texts(findDates(`on ${sample} then`)), sample).toContain(sample);
    }
  });

  it("does not read 'May' as a date without a day number", () => {
    expect(findDates("May I ask")).toHaveLength(0);
  });
});

describe("findAges", () => {
  it("captures only the number, not the surrounding context", () => {
    expect(texts(findAges("a 34 years old man"))).toEqual(["34"]);
    expect(texts(findAges("34 y.o. male"))).toEqual(["34"]);
    expect(texts(findAges("age: 34"))).toEqual(["34"]);
  });

  it("keeps the context words in the output", () => {
    const text = "a 34 years old man";
    const match = findAges(text)[0];
    expect(text.slice(match.start, match.end)).toBe("34");
  });

  it("ignores durations", () => {
    expect(findAges("aged 7 days")).toHaveLength(0);
    expect(findAges("age: 3 months")).toHaveLength(0);
  });
});

describe("maxDigitRun", () => {
  it("measures the longest consecutive digit run", () => {
    expect(maxDigitRun("054-399-0303")).toBe(4);
    expect(maxDigitRun("1 2 3 4")).toBe(1);
    expect(maxDigitRun("no digits")).toBe(0);
  });
});
