import { describe, it, expect } from "vitest";
import {
  ALL_CATEGORIES,
  CATEGORY_DEFS,
  GROUP_ORDER,
  GROUP_LABELS,
  categoriesInGroup,
} from "./registry";
import { defaultRedactionOptions } from "./options";
import { emptySummary } from "./redact";

describe("category registry", () => {
  it("has at least the eight original categories", () => {
    expect(ALL_CATEGORIES.length).toBeGreaterThanOrEqual(8);
  });

  it("gives every category a complete, non-empty definition", () => {
    for (const category of ALL_CATEGORIES) {
      const def = CATEGORY_DEFS[category];
      expect(def, category).toBeDefined();
      expect(def.label, category).not.toBe("");
      expect(def.pseudonymPrefix, category).not.toBe("");
      expect(def.singular, category).not.toBe("");
      expect(def.plural, category).not.toBe("");
      expect(typeof def.detect, category).toBe("function");
      expect(typeof def.pseudonymKey, category).toBe("function");
    }
  });

  // Priorities decide which category wins an overlap. A duplicate makes that
  // outcome depend on object key order, i.e. silently unstable.
  it("assigns a unique priority to every category", () => {
    const priorities = ALL_CATEGORIES.map((c) => CATEGORY_DEFS[c].priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  // These specific orderings are load-bearing bug fixes, not preferences.
  it("ranks date above phone so the Dates toggle actually controls dates", () => {
    expect(CATEGORY_DEFS.date.priority).toBeLessThan(CATEGORY_DEFS.phone.priority);
  });

  it("ranks precise regex categories above NLP guesses", () => {
    for (const nlpCategory of ["person", "place"] as const) {
      for (const regexCategory of ["email", "ssn", "creditCard", "phone"] as const) {
        expect(
          CATEGORY_DEFS[regexCategory].priority,
          `${regexCategory} vs ${nlpCategory}`
        ).toBeLessThan(CATEGORY_DEFS[nlpCategory].priority);
      }
    }
  });

  it("ranks ssn above phone, since an SSN always also looks like a phone", () => {
    expect(CATEGORY_DEFS.ssn.priority).toBeLessThan(CATEGORY_DEFS.phone.priority);
  });

  it("puts every category in a known group, and every group in the order list", () => {
    for (const category of ALL_CATEGORIES) {
      expect(GROUP_ORDER, category).toContain(CATEGORY_DEFS[category].group);
    }
    for (const group of GROUP_ORDER) {
      expect(GROUP_LABELS[group]).toBeTruthy();
    }
  });

  it("covers every category exactly once across the groups", () => {
    const grouped = GROUP_ORDER.flatMap(categoriesInGroup);
    expect(grouped.sort()).toEqual([...ALL_CATEGORIES].sort());
  });
});

// These two used to be hand-written lists that would silently go stale.
describe("derived structures", () => {
  it("gives defaultRedactionOptions an entry for every category", () => {
    const options = defaultRedactionOptions();
    for (const category of ALL_CATEGORIES) {
      expect(options[category], category).toEqual({
        enabled: CATEGORY_DEFS[category].defaultEnabled,
        exactValue: "",
      });
    }
  });

  it("gives emptySummary a zeroed count for every category", () => {
    const counts = emptySummary().counts;
    expect(Object.keys(counts).sort()).toEqual([...ALL_CATEGORIES].sort());
    for (const category of ALL_CATEGORIES) {
      expect(counts[category], category).toBe(0);
    }
  });
});

describe("pseudonym keys", () => {
  it("collapses formatting differences for numeric categories", () => {
    const phone = CATEGORY_DEFS.phone.pseudonymKey;
    expect(phone("054-399-0303")).toBe(phone("0543990303"));
    expect(phone("(054) 399 0303")).toBe(phone("0543990303"));
  });

  it("collapses case and whitespace for names", () => {
    const person = CATEGORY_DEFS.person.pseudonymKey;
    expect(person("John Doe")).toBe(person("john  doe"));
    expect(person("  John Doe ")).toBe(person("John Doe"));
  });

  it("does not collapse two genuinely different values", () => {
    const person = CATEGORY_DEFS.person.pseudonymKey;
    expect(person("John Doe")).not.toBe(person("Jane Doe"));
  });
});
