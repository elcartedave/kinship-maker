import { z } from "zod";

import type { KinshipRelationshipType } from "@/lib/kinship/types";

/** Partner / lateral edge types the model may emit (never `descended-from`). */
export const AI_PARTNER_RELATIONSHIP_TYPES = [
  "married",
  "cohabiting",
  "divorced",
  "separated",
  "fictive",
] as const;

export type AiPartnerRelationshipType =
  (typeof AI_PARTNER_RELATIONSHIP_TYPES)[number];

export const PERSON_ROLES = [
  "ego",
  "mother",
  "father",
  "sister",
  "brother",
  "son",
  "daughter",
  "maternal-grandmother",
  "maternal-grandfather",
  "paternal-grandmother",
  "paternal-grandfather",
  "spouse",
  "partner",
  "aunt",
  "uncle",
  "cousin",
  "child",
  "other",
] as const;

export type PersonRole = (typeof PERSON_ROLES)[number];

export const personSchema = z.object({
  id: z.string().min(1),
  role: z.enum(PERSON_ROLES),
  sex: z.enum(["female", "male"]).nullable().optional(),
  deceased: z.boolean().optional(),
  adopted: z.boolean().optional(),
  isEgo: z.boolean().optional(),
  displayName: z.string().optional(),
});

export const partnerRelationshipSchema = z.object({
  a: z.string().min(1),
  b: z.string().min(1),
  status: z.enum(AI_PARTNER_RELATIONSHIP_TYPES),
});

export const parentRelationshipSchema = z.object({
  child: z.string().min(1),
  parents: z.array(z.string().min(1)).min(1).max(2),
});

export const clarificationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sex"),
    clarificationId: z.string().min(1),
    personId: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.enum(["female", "male"])).min(2).max(2),
  }),
  z.object({
    kind: z.literal("partner-status"),
    clarificationId: z.string().min(1),
    personA: z.string().min(1),
    personB: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.enum(AI_PARTNER_RELATIONSHIP_TYPES)).min(2),
  }),
  z.object({
    kind: z.literal("deceased"),
    clarificationId: z.string().min(1),
    personId: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.enum(["yes", "no"])).length(2),
  }),
  z.object({
    kind: z.literal("adopted"),
    clarificationId: z.string().min(1),
    personId: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.enum(["yes", "no"])).length(2),
  }),
  z.object({
    kind: z.literal("ego"),
    clarificationId: z.string().min(1),
    question: z.string().min(1),
    candidateIds: z.array(z.string().min(1)).min(2),
  }),
]);

export type KinshipClarification = z.infer<typeof clarificationSchema>;

export const kinshipIntentSchema = z
  .object({
    summary: z.string(),
    people: z.array(personSchema).min(1),
    partnerRelationships: z.array(partnerRelationshipSchema),
    parentRelationships: z.array(parentRelationshipSchema),
    clarifications: z.array(clarificationSchema),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (const p of data.people) {
      if (ids.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate person id: ${p.id}`,
        });
        return;
      }
      ids.add(p.id);
    }

    const egos = data.people.filter((p) => p.isEgo === true);
    if (egos.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expected exactly one person with isEgo: true, found ${egos.length}`,
      });
    }

    for (const pr of data.partnerRelationships) {
      if (!ids.has(pr.a) || !ids.has(pr.b)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Partner relationship references unknown id: ${pr.a}, ${pr.b}`,
        });
      }
      if (pr.a === pr.b) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Partner relationship cannot be self-loop",
        });
      }
    }

    for (const rel of data.parentRelationships) {
      if (!ids.has(rel.child)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown child id in parentRelationships: ${rel.child}`,
        });
      }
      for (const p of rel.parents) {
        if (!ids.has(p)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown parent id in parentRelationships: ${p}`,
          });
        }
      }
    }

    for (const c of data.clarifications) {
      if (c.kind === "sex" || c.kind === "deceased" || c.kind === "adopted") {
        if (!ids.has(c.personId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Clarification references unknown personId: ${c.personId}`,
          });
        }
      }
      if (c.kind === "partner-status") {
        if (!ids.has(c.personA) || !ids.has(c.personB)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "partner-status clarification references unknown person",
          });
        }
      }
      if (c.kind === "ego") {
        for (const id of c.candidateIds) {
          if (!ids.has(id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `ego clarification references unknown candidate: ${id}`,
            });
          }
        }
      }
    }
  });

export type KinshipIntent = z.infer<typeof kinshipIntentSchema>;
