import {
  Mail,
  Phone,
  CreditCard,
  Fingerprint,
  User,
  MapPin,
  Calendar,
  Cake,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PIICategory } from "../../types";

interface CategoryMeta {
  icon: LucideIcon;
  singular: string;
  plural: string;
}

export const CATEGORY_META: Record<PIICategory, CategoryMeta> = {
  email: { icon: Mail, singular: "Email address", plural: "Email addresses" },
  phone: { icon: Phone, singular: "Phone number", plural: "Phone numbers" },
  creditCard: {
    icon: CreditCard,
    singular: "Credit card number",
    plural: "Credit card numbers",
  },
  ssn: {
    icon: Fingerprint,
    singular: "Social Security Number",
    plural: "Social Security Numbers",
  },
  person: { icon: User, singular: "Name", plural: "Names" },
  place: { icon: MapPin, singular: "Address", plural: "Addresses" },
  date: { icon: Calendar, singular: "Date", plural: "Dates" },
  age: { icon: Cake, singular: "Age", plural: "Ages" },
};

export const CATEGORY_ORDER: PIICategory[] = [
  "email",
  "phone",
  "creditCard",
  "ssn",
  "person",
  "place",
  "date",
  "age",
];

export function categoryLabel(category: PIICategory, count: number): string {
  const meta = CATEGORY_META[category];
  return count === 1 ? meta.singular : meta.plural;
}
