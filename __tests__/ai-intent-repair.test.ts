import { describe, expect, it } from "vitest";

import { repairIntentJson } from "@/lib/kinship/ai/repair";
import { kinshipIntentSchema } from "@/lib/kinship/ai/schema";

describe("repairIntentJson", () => {
  it("injects an ego when the model omitted the speaker", () => {
    const raw = {
      summary: "User has two parents.",
      people: [
        { id: "father", role: "father", sex: "male" },
        { id: "mother", role: "mother", sex: "female" },
      ],
      partnerRelationships: [],
      parentRelationships: [],
      clarifications: [],
    };

    const repaired = repairIntentJson(raw);
    const parsed = kinshipIntentSchema.parse(repaired);

    const egos = parsed.people.filter((p) => p.isEgo === true);
    expect(egos).toHaveLength(1);
    expect(egos[0].role).toBe("ego");

    const childRel = parsed.parentRelationships.find(
      (r) => r.child === egos[0].id,
    );
    expect(childRel?.parents).toEqual(["father", "mother"]);
  });

  it("promotes an existing role:ego person to isEgo:true", () => {
    const raw = {
      summary: "",
      people: [
        { id: "speaker", role: "ego", sex: "male" },
        { id: "father", role: "father", sex: "male" },
      ],
      partnerRelationships: [],
      parentRelationships: [],
      clarifications: [],
    };

    const repaired = repairIntentJson(raw);
    const parsed = kinshipIntentSchema.parse(repaired);
    const egos = parsed.people.filter((p) => p.isEgo === true);
    expect(egos).toHaveLength(1);
    expect(egos[0].id).toBe("speaker");
  });

  it("keeps only the first ego when several are flagged", () => {
    const raw = {
      summary: "",
      people: [
        { id: "a", role: "ego", sex: "male", isEgo: true },
        { id: "b", role: "sister", sex: "female", isEgo: true },
      ],
      partnerRelationships: [],
      parentRelationships: [],
      clarifications: [],
    };

    const repaired = repairIntentJson(raw);
    const parsed = kinshipIntentSchema.parse(repaired);
    const egos = parsed.people.filter((p) => p.isEgo === true);
    expect(egos).toHaveLength(1);
    expect(egos[0].id).toBe("a");
  });

  it("uses a fresh id when 'ego' is already taken", () => {
    const raw = {
      summary: "",
      people: [
        { id: "ego", role: "father", sex: "male" },
        { id: "mom", role: "mother", sex: "female" },
      ],
      partnerRelationships: [],
      parentRelationships: [],
      clarifications: [],
    };

    const repaired = repairIntentJson(raw);
    const parsed = kinshipIntentSchema.parse(repaired);
    const ego = parsed.people.find((p) => p.isEgo === true);
    expect(ego).toBeTruthy();
    expect(ego!.id).not.toBe("ego");
  });

  describe("partner-status alias normalization", () => {
    function makeIntent(status: unknown, opts?: unknown[]) {
      return {
        summary: "Aunt and uncle.",
        people: [
          { id: "ego", role: "ego", sex: "female", isEgo: true },
          { id: "kim", role: "aunt", sex: "female" },
          { id: "jose", role: "uncle", sex: "male" },
        ],
        partnerRelationships: [{ a: "kim", b: "jose", status }],
        parentRelationships: [],
        clarifications: opts
          ? [
              {
                kind: "partner-status",
                clarificationId: "c1",
                personA: "kim",
                personB: "jose",
                question: "How are Kim and Jose related?",
                options: opts,
              },
            ]
          : [],
      };
    }

    it("maps 'spouse' to 'married'", () => {
      const repaired = repairIntentJson(makeIntent("spouse"));
      const parsed = kinshipIntentSchema.parse(repaired);
      expect(parsed.partnerRelationships[0].status).toBe("married");
    });

    it.each([
      ["marriage", "married"],
      ["MARRIED", "married"],
      ["husband", "married"],
      ["wife", "married"],
      ["widowed", "married"],
      ["partner", "cohabiting"],
      ["common-law", "cohabiting"],
      ["co-habiting", "cohabiting"],
      ["common law", "cohabiting"],
      ["engaged", "cohabiting"],
      ["dating", "cohabiting"],
      ["ex-spouse", "divorced"],
      ["ex-husband", "divorced"],
      ["former", "divorced"],
      ["estranged", "separated"],
      ["broken-up", "separated"],
      ["godparent", "fictive"],
      ["fictive-kin", "fictive"],
    ])("normalizes %s to %s", (input, expected) => {
      const repaired = repairIntentJson(makeIntent(input));
      const parsed = kinshipIntentSchema.parse(repaired);
      expect(parsed.partnerRelationships[0].status).toBe(expected);
    });

    it("treats `type` as an alias for `status`", () => {
      const intent = {
        summary: "",
        people: [
          { id: "ego", role: "ego", sex: "female", isEgo: true },
          { id: "kim", role: "aunt", sex: "female" },
          { id: "jose", role: "uncle", sex: "male" },
        ],
        partnerRelationships: [{ a: "kim", b: "jose", type: "marriage" }],
        parentRelationships: [],
        clarifications: [],
      };
      const repaired = repairIntentJson(intent);
      const parsed = kinshipIntentSchema.parse(repaired);
      expect(parsed.partnerRelationships[0].status).toBe("married");
    });

    it("normalizes partner-status clarification options and dedupes", () => {
      const repaired = repairIntentJson(
        makeIntent("married", ["spouse", "married", "engaged", "ex-spouse"]),
      );
      const parsed = kinshipIntentSchema.parse(repaired);
      const cl = parsed.clarifications.find(
        (x): x is Extract<typeof x, { kind: "partner-status" }> =>
          x.kind === "partner-status",
      );
      expect(cl?.options).toEqual(["married", "cohabiting", "divorced"]);
    });

    it("drops a partnerRelationship whose status cannot be normalized", () => {
      // The model frequently emits "unknown" when it lacks evidence (e.g.
      // grandparents whose marital status the user did not state). Rather
      // than failing the whole request with a Zod error, drop the row so
      // the layout-gap detector can ask the user via a clarification.
      const repaired = repairIntentJson(makeIntent("unknown"));
      const parsed = kinshipIntentSchema.parse(repaired);
      expect(parsed.partnerRelationships).toHaveLength(0);
    });

    it("drops a clarification with an unrecognized kind", () => {
      const intent = {
        summary: "",
        people: [
          { id: "ego", role: "ego", sex: "female", isEgo: true },
          { id: "kim", role: "aunt", sex: "female" },
        ],
        partnerRelationships: [],
        parentRelationships: [],
        clarifications: [
          {
            kind: "side-of-family",
            clarificationId: "side1",
            personId: "kim",
            question: "Maternal or paternal?",
            options: ["maternal", "paternal"],
          },
        ],
      };
      const repaired = repairIntentJson(intent);
      const parsed = kinshipIntentSchema.parse(repaired);
      expect(parsed.clarifications).toHaveLength(0);
    });
  });
});
