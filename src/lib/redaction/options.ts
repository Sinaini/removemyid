import type { PIICategory, RedactionOptions } from "../../types";

export const ALL_CATEGORIES: PIICategory[] = [
  "email",
  "phone",
  "creditCard",
  "ssn",
  "person",
  "place",
  "date",
  "age",
];

export function defaultRedactionOptions(): RedactionOptions {
  return {
    email: { enabled: true, exactValue: "" },
    phone: { enabled: true, exactValue: "" },
    creditCard: { enabled: true, exactValue: "" },
    ssn: { enabled: true, exactValue: "" },
    person: { enabled: true, exactValue: "" },
    place: { enabled: true, exactValue: "" },
    date: { enabled: true, exactValue: "" },
    age: { enabled: true, exactValue: "" },
  };
}
