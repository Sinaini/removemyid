import {
  Mail,
  Phone,
  CreditCard,
  Fingerprint,
  User,
  MapPin,
  Calendar,
  Cake,
  Hash,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PIICategory } from "../../types";
import { ALL_CATEGORIES, CATEGORY_DEFS } from "./registry";

// Icons live here rather than in the registry on purpose: the registry is
// imported by the Web Worker (see tsconfig.worker.json), and putting a
// lucide-react value in it would pull React into the worker bundle.
export const CATEGORY_ICONS: Record<PIICategory, LucideIcon> = {
  email: Mail,
  phone: Phone,
  creditCard: CreditCard,
  accountNumber: Hash,
  ssn: Fingerprint,
  person: User,
  place: MapPin,
  date: Calendar,
  age: Cake,
};

/**
 * Display metadata, assembled from the registry (names) and the map above
 * (icon). Kept in the shape components already consume.
 */
export const CATEGORY_META: Record<
  PIICategory,
  { icon: LucideIcon; singular: string; plural: string }
> = Object.fromEntries(
  ALL_CATEGORIES.map((category) => [
    category,
    {
      icon: CATEGORY_ICONS[category],
      singular: CATEGORY_DEFS[category].singular,
      plural: CATEGORY_DEFS[category].plural,
    },
  ])
) as Record<PIICategory, { icon: LucideIcon; singular: string; plural: string }>;

export const CATEGORY_ORDER: PIICategory[] = ALL_CATEGORIES;

export function categoryLabel(category: PIICategory, count: number): string {
  const def = CATEGORY_DEFS[category];
  return count === 1 ? def.singular : def.plural;
}
