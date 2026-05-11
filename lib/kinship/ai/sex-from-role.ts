import type { PersonRole } from "@/lib/kinship/ai/schema";

/** Roles whose English kinship term implies female symbol shape. */
const FEMALE_ROLES = new Set<PersonRole>([
  "mother",
  "sister",
  "daughter",
  "maternal-grandmother",
  "paternal-grandmother",
  "aunt",
]);

/** Roles whose English kinship term implies male symbol shape. */
const MALE_ROLES = new Set<PersonRole>([
  "father",
  "brother",
  "son",
  "maternal-grandfather",
  "paternal-grandfather",
  "uncle",
]);

const AMBIGUOUS_ROLES = new Set<PersonRole>([
  "ego",
  "spouse",
  "partner",
  "cousin",
  "child",
  "other",
]);

/** Lowercase substrings in displayName — only used when `role` is ambiguous. */
const FEMALE_NAME_HINTS = [
  "grandma",
  "grandmother",
  "granny",
  "nana",
  "nan",
  "mom",
  "mother",
  "mum",
  "mummy",
  "aunt",
  "sister",
  "daughter",
  "wife",
  "mrs",
  "ms",
  "miss",
  "girl",
  "woman",
  "lady",
] as const;

const MALE_NAME_HINTS = [
  "grandpa",
  "grandfather",
  "granddad",
  "pops",
  "dad",
  "father",
  "papa",
  "uncle",
  "brother",
  "son",
  "husband",
  "mr",
  "sir",
  "boy",
  "man",
  "gentleman",
] as const;

export type KinshipPersonLike = {
  role: PersonRole;
  sex?: "female" | "male" | null;
  displayName?: string;
};

/**
 * Returns inferred sex from role (and optionally displayName for ambiguous roles).
 * Does not read `person.sex` — callers merge that themselves.
 */
export function inferSexFromKinshipSignals(
  person: KinshipPersonLike,
): "female" | "male" | null {
  if (FEMALE_ROLES.has(person.role)) {
    return "female";
  }
  if (MALE_ROLES.has(person.role)) {
    return "male";
  }

  if (!AMBIGUOUS_ROLES.has(person.role)) {
    return null;
  }

  const raw = person.displayName?.trim().toLowerCase() ?? "";
  if (raw.length === 0) {
    return null;
  }

  let femaleScore = 0;
  for (const hint of FEMALE_NAME_HINTS) {
    if (raw.includes(hint)) {
      femaleScore += 1;
    }
  }
  let maleScore = 0;
  for (const hint of MALE_NAME_HINTS) {
    if (raw.includes(hint)) {
      maleScore += 1;
    }
  }

  if (femaleScore > 0 && maleScore === 0) {
    return "female";
  }
  if (maleScore > 0 && femaleScore === 0) {
    return "male";
  }

  return null;
}

/**
 * Resolved symbol sex: explicit `sex` when valid, otherwise inference from role/name.
 */
export function effectiveSex(person: KinshipPersonLike): "female" | "male" | null {
  if (person.sex === "female" || person.sex === "male") {
    return person.sex;
  }
  return inferSexFromKinshipSignals(person);
}
