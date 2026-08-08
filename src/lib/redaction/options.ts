import type { PIICategory, RedactionOptions } from "../../types";
import { ALL_CATEGORIES, CATEGORY_DEFS } from "./registry";

// Re-exported so the many existing importers of ALL_CATEGORIES from this
// module keep working; the list itself is now derived from the registry rather
// than hand-maintained here.
export { ALL_CATEGORIES };

export function defaultRedactionOptions(): RedactionOptions {
  const options = {} as RedactionOptions;
  for (const category of ALL_CATEGORIES) {
    options[category] = {
      enabled: CATEGORY_DEFS[category].defaultEnabled,
      exactValue: "",
    };
  }
  return options;
}

export function isCategory(value: string): value is PIICategory {
  return Object.hasOwn(CATEGORY_DEFS, value);
}
