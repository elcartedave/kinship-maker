import { applyClarificationAnswers } from "@/lib/kinship/ai/apply-clarifications";
import { enrichClarificationQuestions } from "@/lib/kinship/ai/clarification-copy";
import { normalizeIntentSexAndClarifications } from "@/lib/kinship/ai/normalize-intent";
import type {
  KinshipClarification,
  KinshipIntent,
} from "@/lib/kinship/ai/schema";
import {
  AI_PARTNER_RELATIONSHIP_TYPES,
  kinshipIntentSchema,
} from "@/lib/kinship/ai/schema";
import { effectiveSex } from "@/lib/kinship/ai/sex-from-role";

function personLabel(person: KinshipIntent["people"][number]): string {
  const name = person.displayName?.trim();
  if (name) {
    return name;
  }
  return person.role.replace(/-/g, " ");
}

function rolePhrase(role: KinshipIntent["people"][number]["role"]): string {
  return role.replace(/-/g, " ");
}

function hasSexClarificationFor(
  clarifications: KinshipClarification[],
  personId: string,
): boolean {
  return clarifications.some(
    (c) => c.kind === "sex" && c.personId === personId,
  );
}

function hasPartnerStatusClarificationFor(
  clarifications: KinshipClarification[],
  a: string,
  b: string,
): boolean {
  return clarifications.some(
    (c) =>
      c.kind === "partner-status" &&
      ((c.personA === a && c.personB === b) ||
        (c.personA === b && c.personB === a)),
  );
}

function hasPartnerEdgeBetween(
  intent: KinshipIntent,
  a: string,
  b: string,
): boolean {
  return intent.partnerRelationships.some(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
  );
}

/**
 * Pairs of ids that share a child (and therefore need a partner connector
 * for layout to draw the parent–child drop line correctly).
 */
function coParentPairs(intent: KinshipIntent): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const rel of intent.parentRelationships) {
    if (rel.parents.length !== 2) {
      continue;
    }
    const [x, y] = [...rel.parents].sort();
    const key = `${x}::${y}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push([x, y]);
  }
  return out;
}

/**
 * Append synthetic multiple-choice rows for anything the lowering step needs
 * but the model omitted: per-person sex (drives symbol shape), and a partner
 * line between any two co-parents. Returns the original intent unchanged when
 * nothing is missing.
 */
export function augmentIntentWithLayoutGaps(
  intent: KinshipIntent,
): KinshipIntent {
  const base = normalizeIntentSexAndClarifications(intent);
  const extras: KinshipClarification[] = [];

  for (const person of base.people) {
    const sexMissing = effectiveSex(person) === null;
    if (
      sexMissing &&
      !hasSexClarificationFor(base.clarifications, person.id) &&
      !extras.some((e) => e.kind === "sex" && e.personId === person.id)
    ) {
      extras.push({
        kind: "sex",
        clarificationId: `gap-sex-${person.id}`,
        personId: person.id,
        question: `What is ${personLabel(person)}'s sex (for the symbol shape)?`,
        options: ["female", "male"],
      });
    }
  }

  for (const [a, b] of coParentPairs(base)) {
    if (hasPartnerEdgeBetween(base, a, b)) {
      continue;
    }
    if (
      hasPartnerStatusClarificationFor(base.clarifications, a, b) ||
      extras.some(
        (e) =>
          e.kind === "partner-status" &&
          ((e.personA === a && e.personB === b) ||
            (e.personA === b && e.personB === a)),
      )
    ) {
      continue;
    }
    const pa = base.people.find((p) => p.id === a);
    const pb = base.people.find((p) => p.id === b);
    const la = pa ? personLabel(pa) : a;
    const lb = pb ? personLabel(pb) : b;
    const ra = pa ? rolePhrase(pa.role) : "person";
    const rb = pb ? rolePhrase(pb.role) : "person";
    extras.push({
      kind: "partner-status",
      clarificationId: `gap-partner-${a}-${b}`,
      personA: a,
      personB: b,
      question: `What is the relationship between ${la} (${ra}) and ${lb} (${rb}) on the chart?`,
      options: [...AI_PARTNER_RELATIONSHIP_TYPES],
    });
  }

  if (extras.length === 0) {
    return kinshipIntentSchema.parse(enrichClarificationQuestions(base));
  }

  const merged: KinshipIntent = {
    ...base,
    clarifications: [...base.clarifications, ...extras],
  };
  return kinshipIntentSchema.parse(enrichClarificationQuestions(merged));
}

export type ResolveGapsResult =
  | { ok: true; intent: KinshipIntent }
  | { ok: false; intent: KinshipIntent };

/**
 * Apply saved answers, then keep injecting any newly-revealed layout gaps and
 * re-applying answers until either the intent is fully resolved (`ok: true`),
 * the user still owes picks (`ok: false`), or progress stalls.
 */
export function mergeAnswersAndResolveGaps(
  intent: KinshipIntent,
  answers: Record<string, string>,
): ResolveGapsResult {
  let working = applyClarificationAnswers(intent, answers);

  for (let i = 0; i < 16; i += 1) {
    working = augmentIntentWithLayoutGaps(working);

    const unanswered = working.clarifications.filter(
      (c) => answers[c.clarificationId] === undefined,
    );
    if (unanswered.length > 0) {
      return { ok: false, intent: working };
    }
    if (working.clarifications.length === 0) {
      return { ok: true, intent: working };
    }

    const beforeIds = working.clarifications
      .map((c) => c.clarificationId)
      .join("|");
    working = applyClarificationAnswers(working, answers);
    const afterIds = working.clarifications
      .map((c) => c.clarificationId)
      .join("|");
    if (beforeIds === afterIds) {
      return { ok: false, intent: working };
    }
  }

  return { ok: false, intent: working };
}
