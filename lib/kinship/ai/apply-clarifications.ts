import type { AiPartnerRelationshipType } from "@/lib/kinship/ai/schema";
import { kinshipIntentSchema, type KinshipIntent } from "@/lib/kinship/ai/schema";

/**
 * Merge multiple-choice answers into a {@link KinshipIntent} returned by the
 * model. Answered clarification rows are removed; the result is re-parsed with
 * Zod so structural invariants stay enforced.
 */
export function applyClarificationAnswers(
  intent: KinshipIntent,
  answers: Record<string, string>,
): KinshipIntent {
  const clone = structuredClone(intent) as KinshipIntent;

  for (const c of clone.clarifications) {
    const ans = answers[c.clarificationId];
    if (ans === undefined) {
      continue;
    }

    switch (c.kind) {
      case "sex": {
        const person = clone.people.find((p) => p.id === c.personId);
        if (person && (ans === "female" || ans === "male")) {
          person.sex = ans;
        }
        break;
      }
      case "partner-status": {
        const status = ans as AiPartnerRelationshipType;
        const existing = clone.partnerRelationships.find(
          (r) =>
            (r.a === c.personA && r.b === c.personB) ||
            (r.a === c.personB && r.b === c.personA),
        );
        if (existing) {
          existing.status = status;
        } else {
          clone.partnerRelationships.push({
            a: c.personA,
            b: c.personB,
            status,
          });
        }
        break;
      }
      case "deceased": {
        const person = clone.people.find((p) => p.id === c.personId);
        if (person) {
          person.deceased = ans === "yes";
        }
        break;
      }
      case "adopted": {
        const person = clone.people.find((p) => p.id === c.personId);
        if (person) {
          person.adopted = ans === "yes";
        }
        break;
      }
      case "ego": {
        for (const p of clone.people) {
          p.isEgo = p.id === ans;
        }
        break;
      }
      default:
        break;
    }
  }

  clone.clarifications = clone.clarifications.filter(
    (c) => answers[c.clarificationId] === undefined,
  );

  return kinshipIntentSchema.parse(clone);
}
