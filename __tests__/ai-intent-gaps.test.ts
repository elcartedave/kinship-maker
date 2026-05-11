import { describe, expect, it } from "vitest";

import {
  augmentIntentWithLayoutGaps,
  mergeAnswersAndResolveGaps,
} from "@/lib/kinship/ai/intent-gaps";
import { intentToKinshipGraph } from "@/lib/kinship/ai/intent-to-chart";
import { kinshipIntentSchema } from "@/lib/kinship/ai/schema";

const intentMissingEgoSex = kinshipIntentSchema.parse({
  summary: "Ego with married parents.",
  people: [
    { id: "ego", role: "ego", sex: null, isEgo: true },
    { id: "father", role: "father", sex: "male" },
    { id: "mother", role: "mother", sex: "female" },
  ],
  partnerRelationships: [{ a: "father", b: "mother", status: "married" }],
  parentRelationships: [{ child: "ego", parents: ["father", "mother"] }],
  clarifications: [],
});

const intentMissingPartnerEdge = kinshipIntentSchema.parse({
  summary: "Ego with two parents but no stated relationship.",
  people: [
    { id: "ego", role: "ego", sex: "male", isEgo: true },
    { id: "father", role: "father", sex: "male" },
    { id: "mother", role: "mother", sex: "female" },
  ],
  partnerRelationships: [],
  parentRelationships: [{ child: "ego", parents: ["father", "mother"] }],
  clarifications: [],
});

describe("augmentIntentWithLayoutGaps", () => {
  it("adds a sex clarification for any person whose sex is null", () => {
    const augmented = augmentIntentWithLayoutGaps(intentMissingEgoSex);
    const sexQ = augmented.clarifications.filter(
      (c) => c.kind === "sex" && c.personId === "ego",
    );
    expect(sexQ).toHaveLength(1);
  });

  it("adds a partner-status clarification when co-parents have no edge", () => {
    const augmented = augmentIntentWithLayoutGaps(intentMissingPartnerEdge);
    const partnerQ = augmented.clarifications.filter(
      (c) => c.kind === "partner-status",
    );
    expect(partnerQ).toHaveLength(1);
    expect(partnerQ[0]).toMatchObject({
      personA: "father",
      personB: "mother",
    });
  });

  it("returns the same intent when nothing is missing", () => {
    const fully = kinshipIntentSchema.parse({
      ...intentMissingEgoSex,
      people: intentMissingEgoSex.people.map((p) =>
        p.id === "ego" ? { ...p, sex: "male" } : p,
      ),
    });
    const augmented = augmentIntentWithLayoutGaps(fully);
    expect(augmented.clarifications).toEqual([]);
  });

  it("does not add sex clarification for grandmother when sex was null", () => {
    const intent = kinshipIntentSchema.parse({
      summary: "Ego with mother and maternal grandmother.",
      people: [
        { id: "ego", role: "ego", sex: "female", isEgo: true },
        { id: "mother", role: "mother", sex: null },
        {
          id: "mgm",
          role: "maternal-grandmother",
          sex: null,
        },
        {
          id: "mgf",
          role: "maternal-grandfather",
          sex: null,
        },
      ],
      partnerRelationships: [{ a: "mgm", b: "mgf", status: "married" }],
      parentRelationships: [
        { child: "ego", parents: ["mother"] },
        { child: "mother", parents: ["mgm", "mgf"] },
      ],
      clarifications: [],
    });
    const augmented = augmentIntentWithLayoutGaps(intent);
    const sexIds = augmented.clarifications
      .filter((c) => c.kind === "sex")
      .map((c) => c.personId);
    expect(sexIds).not.toContain("mgm");
    expect(sexIds).not.toContain("mgf");
    expect(sexIds).not.toContain("mother");
  });

  it("partner-status gap question includes role context", () => {
    const augmented = augmentIntentWithLayoutGaps(intentMissingPartnerEdge);
    const partnerQ = augmented.clarifications.find(
      (c) => c.kind === "partner-status",
    );
    expect(partnerQ?.question).toContain("father");
    expect(partnerQ?.question).toContain("mother");
  });
});

describe("mergeAnswersAndResolveGaps", () => {
  it("returns ok:false when answers are missing", () => {
    const result = mergeAnswersAndResolveGaps(intentMissingEgoSex, {});
    expect(result.ok).toBe(false);
    expect(
      result.intent.clarifications.find(
        (c) => c.kind === "sex" && c.personId === "ego",
      ),
    ).toBeTruthy();
  });

  it("returns ok:true once every gap is answered", () => {
    const augmented = augmentIntentWithLayoutGaps(intentMissingEgoSex);
    const sexQ = augmented.clarifications.find(
      (c) => c.kind === "sex" && c.personId === "ego",
    );
    expect(sexQ).toBeTruthy();
    const result = mergeAnswersAndResolveGaps(augmented, {
      [sexQ!.clarificationId]: "female",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.clarifications).toEqual([]);
      const { nodes } = intentToKinshipGraph(result.intent);
      const egoNode = nodes.find((n) => n.id === "ego");
      expect(egoNode?.data.symbolType).toBe("female-ego");
    }
  });

  it("co-parent partner-status answer is applied", () => {
    const augmented = augmentIntentWithLayoutGaps(intentMissingPartnerEdge);
    const partnerQ = augmented.clarifications.find(
      (c) => c.kind === "partner-status",
    );
    expect(partnerQ).toBeTruthy();
    const result = mergeAnswersAndResolveGaps(augmented, {
      [partnerQ!.clarificationId]: "cohabiting",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { edges } = intentToKinshipGraph(result.intent);
      const partner = edges.find(
        (e) => e.data?.relationshipType === "cohabiting",
      );
      expect(partner).toBeTruthy();
    }
  });
});
