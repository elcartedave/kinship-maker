import { AI_PARTNER_RELATIONSHIP_TYPES } from "@/lib/kinship/ai/schema";

type LooseObject = Record<string, unknown>;

function isObj(value: unknown): value is LooseObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Common LLM-emitted synonyms for the canonical partner-status enum. The
 * model frequently chooses words from outside the strict
 * `married|cohabiting|divorced|separated|fictive` set ("spouse", "engaged",
 * "ex-husband", etc.), which Zod then rejects. Normalizing here keeps the
 * user out of an avoidable error path.
 *
 * Keys are written without separators or casing — input is lowercased and
 * non-alphanumeric chars are stripped before lookup, so "co-habiting",
 * "common law", and "co_habiting" all resolve to "cohabiting".
 */
const PARTNER_STATUS_ALIASES: Record<
  string,
  (typeof AI_PARTNER_RELATIONSHIP_TYPES)[number]
> = {
  married: "married",
  marriage: "married",
  marry: "married",
  spouse: "married",
  spouses: "married",
  husband: "married",
  wife: "married",
  wedded: "married",
  remarried: "married",
  widow: "married",
  widowed: "married",
  widower: "married",

  cohabiting: "cohabiting",
  cohabitation: "cohabiting",
  cohab: "cohabiting",
  livingtogether: "cohabiting",
  partner: "cohabiting",
  partners: "cohabiting",
  partnered: "cohabiting",
  domesticpartner: "cohabiting",
  domesticpartnership: "cohabiting",
  commonlaw: "cohabiting",
  unmarried: "cohabiting",
  unmarriedpartner: "cohabiting",
  lifepartner: "cohabiting",
  dating: "cohabiting",
  engaged: "cohabiting",
  engagement: "cohabiting",
  boyfriend: "cohabiting",
  girlfriend: "cohabiting",

  divorced: "divorced",
  divorce: "divorced",
  exspouse: "divorced",
  exhusband: "divorced",
  exwife: "divorced",
  expartner: "divorced",
  ex: "divorced",
  former: "divorced",

  separated: "separated",
  separation: "separated",
  estranged: "separated",
  split: "separated",
  breakup: "separated",
  brokenup: "separated",

  fictive: "fictive",
  fictivekin: "fictive",
  godparent: "fictive",
  godparents: "fictive",
  symbolic: "fictive",
};

/**
 * Coerce a free-form partner-status string into the canonical enum value
 * if a known alias matches, otherwise return the original value (so Zod
 * surfaces the validation error rather than this layer silently passing
 * something the schema rejects).
 */
function normalizePartnerStatus(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return PARTNER_STATUS_ALIASES[key] ?? value;
}

function isCanonicalPartnerStatus(
  value: unknown,
): value is (typeof AI_PARTNER_RELATIONSHIP_TYPES)[number] {
  return (
    typeof value === "string" &&
    (AI_PARTNER_RELATIONSHIP_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Normalize each partnerRelationship's status, dropping the entire entry
 * when it can't be coerced into a canonical enum value (e.g. the model
 * emits "unknown" or "in-a-relationship" because it doesn't have evidence).
 *
 * Dropping is correct here: `augmentIntentWithLayoutGaps` already injects
 * a partner-status clarification whenever two co-parents share a child but
 * have no partnerRelationship row, so the user is still prompted for the
 * unstated status — but we don't fail the request before they get there.
 */
function normalizePartnerRelationships(rels: unknown[]): unknown[] {
  return rels.flatMap((rel) => {
    if (!isObj(rel)) {
      return [];
    }
    // Some models emit `type` instead of `status`; treat them as aliases.
    const rawStatus = rel.status ?? rel.type;
    const normalized = normalizePartnerStatus(rawStatus);
    if (!isCanonicalPartnerStatus(normalized)) {
      return [];
    }
    return [{ ...rel, status: normalized }];
  });
}

const VALID_CLARIFICATION_KINDS = new Set([
  "sex",
  "partner-status",
  "deceased",
  "adopted",
  "ego",
]);

/**
 * Normalize partner-status clarification options and drop entries with an
 * unrecognized `kind` discriminator. Models occasionally invent new
 * clarification kinds (e.g. "side-of-family") which crash the
 * discriminated-union check; silently dropping them is safer than failing
 * the whole request because the layout-gap detector re-injects standard
 * clarifications afterwards.
 */
function normalizeClarificationOptions(clarifications: unknown[]): unknown[] {
  return clarifications.flatMap((c) => {
    if (!isObj(c)) {
      return [];
    }
    if (typeof c.kind !== "string" || !VALID_CLARIFICATION_KINDS.has(c.kind)) {
      return [];
    }
    if (c.kind !== "partner-status") {
      return [c];
    }
    if (!Array.isArray(c.options)) {
      return [c];
    }
    const seen = new Set<string>();
    const next: unknown[] = [];
    for (const opt of c.options) {
      const normalized = normalizePartnerStatus(opt);
      if (isCanonicalPartnerStatus(normalized) && !seen.has(normalized)) {
        seen.add(normalized);
        next.push(normalized);
      }
    }
    return [{ ...c, options: next }];
  });
}

/**
 * Normalize an LLM-emitted intent JSON before strict Zod validation. The model
 * sometimes omits the speaker entirely (e.g. "I have two parents" → just two
 * parent people, no ego). Whenever we can structurally deduce the missing
 * pieces, we do so here so the user sees a draft instead of a 502.
 *
 * Repair steps:
 *   1. If no person has `isEgo: true`, promote a `role: "ego"` person if one
 *      exists; otherwise inject a synthetic ego node and link it as the child
 *      of any mother/father people we already see.
 *   2. If multiple egos are flagged, keep only the first.
 *   3. Ensure required arrays exist (Zod still validates types).
 */
export function repairIntentJson(raw: unknown): unknown {
  if (!isObj(raw)) {
    return raw;
  }
  const obj: LooseObject = { ...raw };

  if (!Array.isArray(obj.people)) {
    return obj;
  }
  const people = [...(obj.people as unknown[])];

  if (!Array.isArray(obj.partnerRelationships)) {
    obj.partnerRelationships = [];
  }
  if (!Array.isArray(obj.parentRelationships)) {
    obj.parentRelationships = [];
  }
  if (!Array.isArray(obj.clarifications)) {
    obj.clarifications = [];
  }

  let firstEgoIdx = -1;
  for (let i = 0; i < people.length; i += 1) {
    const p = people[i];
    if (isObj(p) && p.isEgo === true) {
      if (firstEgoIdx === -1) {
        firstEgoIdx = i;
      } else {
        people[i] = { ...p, isEgo: false };
      }
    }
  }

  if (firstEgoIdx === -1) {
    const explicitEgoIdx = people.findIndex(
      (p) => isObj(p) && p.role === "ego",
    );
    if (explicitEgoIdx !== -1) {
      const target = people[explicitEgoIdx] as LooseObject;
      people[explicitEgoIdx] = { ...target, isEgo: true };
    } else {
      const existingIds = new Set(
        people.filter(isObj).map((p) => String(p.id ?? "")),
      );
      let newId = "ego";
      let n = 2;
      while (existingIds.has(newId)) {
        newId = `ego-${n}`;
        n += 1;
      }
      const newEgo: LooseObject = {
        id: newId,
        role: "ego",
        sex: null,
        isEgo: true,
      };
      people.unshift(newEgo);

      const parents = people
        .filter(isObj)
        .filter((p) => p.role === "mother" || p.role === "father")
        .map((p) => String(p.id ?? ""))
        .filter((id) => id.length > 0);

      if (parents.length > 0) {
        const parentRels = obj.parentRelationships as unknown[];
        const alreadyLinked = parentRels.some(
          (r) => isObj(r) && r.child === newId,
        );
        if (!alreadyLinked) {
          parentRels.push({ child: newId, parents });
          obj.parentRelationships = parentRels;
        }
      }
    }
  }

  obj.people = people;

  // Normalize partner-status enums before Zod sees them. The model often
  // emits "spouse", "engaged", "ex-husband", etc. (see PARTNER_STATUS_ALIASES).
  if (Array.isArray(obj.partnerRelationships)) {
    obj.partnerRelationships = normalizePartnerRelationships(
      obj.partnerRelationships as unknown[],
    );
  }
  if (Array.isArray(obj.clarifications)) {
    obj.clarifications = normalizeClarificationOptions(
      obj.clarifications as unknown[],
    );
  }

  return obj;
}
