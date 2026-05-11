import { describe, expect, it } from "vitest";

import { normalizeIntentSexAndClarifications } from "@/lib/kinship/ai/normalize-intent";
import {
  effectiveSex,
  inferSexFromKinshipSignals,
} from "@/lib/kinship/ai/sex-from-role";
import { kinshipIntentSchema } from "@/lib/kinship/ai/schema";

describe("inferSexFromKinshipSignals", () => {
  it("infers female from mother and grandmother roles", () => {
    expect(inferSexFromKinshipSignals({ role: "mother" })).toBe("female");
    expect(
      inferSexFromKinshipSignals({ role: "maternal-grandmother" }),
    ).toBe("female");
    expect(inferSexFromKinshipSignals({ role: "aunt" })).toBe("female");
  });

  it("infers male from father and grandfather roles", () => {
    expect(inferSexFromKinshipSignals({ role: "father" })).toBe("male");
    expect(
      inferSexFromKinshipSignals({ role: "paternal-grandfather" }),
    ).toBe("male");
    expect(inferSexFromKinshipSignals({ role: "uncle" })).toBe("male");
  });

  it("returns null for ambiguous roles without name hints", () => {
    expect(inferSexFromKinshipSignals({ role: "ego" })).toBeNull();
    expect(inferSexFromKinshipSignals({ role: "cousin" })).toBeNull();
  });

  it("uses displayName hints for ambiguous roles when unambiguous", () => {
    expect(
      inferSexFromKinshipSignals({
        role: "cousin",
        displayName: "Uncle Bob",
      }),
    ).toBe("male");
    expect(
      inferSexFromKinshipSignals({
        role: "other",
        displayName: "Grandma Rose",
      }),
    ).toBe("female");
  });

  it("effectiveSex prefers explicit sex over role", () => {
    expect(
      effectiveSex({ role: "mother", sex: "male" }),
    ).toBe("male");
  });
});

describe("normalizeIntentSexAndClarifications", () => {
  it("fills sex for kin roles and strips redundant sex clarifications", () => {
    const raw = kinshipIntentSchema.parse({
      summary: "Family",
      people: [
        { id: "ego", role: "ego", sex: null, isEgo: true },
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
        { id: "mother", role: "mother", sex: null },
      ],
      partnerRelationships: [],
      parentRelationships: [
        { child: "ego", parents: ["mother"] },
        { child: "mother", parents: ["mgm", "mgf"] },
      ],
      clarifications: [
        {
          kind: "sex" as const,
          clarificationId: "c-mother",
          personId: "mother",
          question: "Mother sex?",
          options: ["female", "male"] as const,
        },
      ],
    });

    const out = normalizeIntentSexAndClarifications(raw);
    expect(out.people.find((p) => p.id === "mother")?.sex).toBe("female");
    expect(out.people.find((p) => p.id === "mgm")?.sex).toBe("female");
    expect(
      out.clarifications.some((c) => c.kind === "sex" && c.personId === "mother"),
    ).toBe(false);
  });
});
