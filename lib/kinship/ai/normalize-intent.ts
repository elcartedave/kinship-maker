import { kinshipIntentSchema, type KinshipIntent } from "@/lib/kinship/ai/schema";

import { inferSexFromKinshipSignals } from "@/lib/kinship/ai/sex-from-role";

/**
 * Fills `sex` from unambiguous kinship roles (and optional displayName hints for
 * ambiguous roles), then drops redundant `kind: "sex"` clarifications so the UI
 * does not ask obvious questions (e.g. grandmother, mother, uncle).
 */
export function normalizeIntentSexAndClarifications(
  intent: KinshipIntent,
): KinshipIntent {
  const clone = structuredClone(intent) as KinshipIntent;

  for (const person of clone.people) {
    const inferred = inferSexFromKinshipSignals(person);
    if (inferred && person.sex !== "female" && person.sex !== "male") {
      person.sex = inferred;
    }
  }

  clone.clarifications = clone.clarifications.filter((c) => {
    if (c.kind !== "sex") {
      return true;
    }
    const p = clone.people.find((x) => x.id === c.personId);
    if (!p) {
      return true;
    }
    const resolved = p.sex === "female" || p.sex === "male";
    return !resolved;
  });

  return kinshipIntentSchema.parse(clone);
}
