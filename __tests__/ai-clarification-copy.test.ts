import { describe, expect, it } from "vitest";

import { enrichClarificationQuestions } from "@/lib/kinship/ai/clarification-copy";
import { augmentIntentWithLayoutGaps } from "@/lib/kinship/ai/intent-gaps";
import { kinshipIntentSchema } from "@/lib/kinship/ai/schema";

describe("enrichClarificationQuestions", () => {
  it("prefixes short sex questions with summary context and person labels", () => {
    const intent = kinshipIntentSchema.parse({
      summary: "I live with my parents and two siblings.",
      people: [
        { id: "ego", role: "ego", sex: null, isEgo: true },
        { id: "p1", role: "other", sex: null },
      ],
      partnerRelationships: [],
      parentRelationships: [{ child: "ego", parents: ["p1"] }],
      clarifications: [
        {
          kind: "sex" as const,
          clarificationId: "c1",
          personId: "ego",
          question: "Sex?",
          options: ["female", "male"] as const,
        },
      ],
    });
    const out = enrichClarificationQuestions(intent);
    expect(out.clarifications[0].question).toContain("I live with my parents");
    expect(out.clarifications[0].question).toContain("ego");
    expect(out.clarifications[0].question.toLowerCase()).toContain("sex");
  });

  it("does not wrap already-long model-authored questions", () => {
    const longQ =
      "You mentioned your parents are still together but did not say whether they are married, cohabiting, separated, or divorced — which applies?";
    const intent = kinshipIntentSchema.parse({
      summary: "Short.",
      people: [
        { id: "ego", role: "ego", sex: "male", isEgo: true },
        { id: "a", role: "mother", sex: "female" },
        { id: "b", role: "father", sex: "male" },
      ],
      partnerRelationships: [],
      parentRelationships: [{ child: "ego", parents: ["a", "b"] }],
      clarifications: [
        {
          kind: "partner-status" as const,
          clarificationId: "p1",
          personA: "a",
          personB: "b",
          question: longQ,
          options: ["married", "cohabiting"] as const,
        },
      ],
    });
    const out = enrichClarificationQuestions(intent);
    expect(out.clarifications[0].question).toBe(longQ);
  });
});

describe("augmentIntentWithLayoutGaps + enrich", () => {
  it("enriches synthetic gap clarifications", () => {
    const intent = kinshipIntentSchema.parse({
      summary: "My parents and me.",
      people: [
        { id: "ego", role: "ego", sex: "male", isEgo: true },
        { id: "f", role: "father", sex: "male" },
        { id: "m", role: "mother", sex: "female" },
      ],
      partnerRelationships: [],
      parentRelationships: [{ child: "ego", parents: ["f", "m"] }],
      clarifications: [],
    });
    const out = augmentIntentWithLayoutGaps(intent);
    const partner = out.clarifications.find((c) => c.kind === "partner-status");
    expect(partner).toBeTruthy();
    expect(partner!.question).toContain("My parents and me");
    expect(partner!.question).toContain("mother");
  });
});
