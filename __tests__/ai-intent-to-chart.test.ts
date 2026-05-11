import { describe, expect, it } from "vitest";

import {
  chartHasEgoSymbol,
  computeSubgraphMergeOffset,
  intentToKinshipGraph,
  orderedPartnerIdsForLayout,
  remapKinshipIds,
  translateSymbolNodes,
} from "@/lib/kinship/ai/intent-to-chart";
import { kinshipIntentSchema } from "@/lib/kinship/ai/schema";
import { createKinshipNode } from "@/lib/kinship/document";
import type { KinshipNode } from "@/lib/kinship/types";

const sampleFamilyIntent = {
  summary: "Ego with two siblings and married parents.",
  people: [
    { id: "ego", role: "ego" as const, sex: "male" as const, isEgo: true },
    { id: "father", role: "father" as const, sex: "male" as const },
    { id: "mother", role: "mother" as const, sex: "female" as const },
    { id: "brother", role: "brother" as const, sex: "male" as const },
    { id: "sister", role: "sister" as const, sex: "female" as const },
  ],
  partnerRelationships: [
    { a: "father", b: "mother", status: "married" as const },
  ],
  parentRelationships: [
    { child: "ego", parents: ["father", "mother"] },
    { child: "brother", parents: ["father", "mother"] },
    { child: "sister", parents: ["father", "mother"] },
  ],
  clarifications: [] as const,
};

describe("kinshipIntentSchema", () => {
  it("accepts a complete family intent", () => {
    const parsed = kinshipIntentSchema.parse(sampleFamilyIntent);
    expect(parsed.people).toHaveLength(5);
    expect(parsed.people.filter((p) => p.isEgo)).toHaveLength(1);
  });

  it("rejects zero egos", () => {
    const bad = {
      ...sampleFamilyIntent,
      people: sampleFamilyIntent.people.map((p) =>
        p.id === "ego" ? { ...p, isEgo: false } : p,
      ),
    };
    const result = kinshipIntentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("intentToKinshipGraph", () => {
  it("produces five symbol nodes and one male ego", () => {
    const intent = kinshipIntentSchema.parse(sampleFamilyIntent);
    const { nodes, edges } = intentToKinshipGraph(intent);

    expect(nodes).toHaveLength(5);
    const egoNode = nodes.find((n) => n.id === "ego");
    expect(egoNode?.data.symbolType).toBe("male-ego");

    const married = edges.filter(
      (e) => e.data?.relationshipType === "married",
    );
    const lineage = edges.filter(
      (e) => e.data?.relationshipType === "descended-from",
    );
    expect(married).toHaveLength(1);
    expect(lineage).toHaveLength(6);
  });

  it("throws if clarifications are still pending", () => {
    const intent = kinshipIntentSchema.parse({
      ...sampleFamilyIntent,
      clarifications: [
        {
          kind: "sex" as const,
          clarificationId: "c1",
          personId: "brother",
          question: "Brother sex?",
          options: ["female", "male"] as const,
        },
      ],
    });
    expect(() => intentToKinshipGraph(intent)).toThrow(/clarifications/);
  });

  it("lays out extended family: ego, parents, grandparents, aunt", () => {
    const extended = kinshipIntentSchema.parse({
      summary: "Three generations plus aunt.",
      people: [
        { id: "ego", role: "ego", sex: "female", isEgo: true },
        { id: "father", role: "father", sex: "male" },
        { id: "mother", role: "mother", sex: "female" },
        { id: "pgm", role: "paternal-grandmother", sex: "female" },
        { id: "pgf", role: "paternal-grandfather", sex: "male" },
        { id: "mgm", role: "maternal-grandmother", sex: "female" },
        { id: "mgf", role: "maternal-grandfather", sex: "male" },
        { id: "aunt", role: "aunt", sex: "female" },
      ],
      partnerRelationships: [
        { a: "father", b: "mother", status: "married" },
        { a: "pgf", b: "pgm", status: "married" },
        { a: "mgf", b: "mgm", status: "married" },
      ],
      parentRelationships: [
        { child: "ego", parents: ["father", "mother"] },
        { child: "father", parents: ["pgf", "pgm"] },
        { child: "mother", parents: ["mgf", "mgm"] },
        { child: "aunt", parents: ["mgf", "mgm"] },
      ],
      clarifications: [],
    });
    const { nodes, edges } = intentToKinshipGraph(extended);
    expect(nodes).toHaveLength(8);
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
    const lineage = edges.filter(
      (e) => e.data?.relationshipType === "descended-from",
    );
    expect(lineage.length).toBeGreaterThanOrEqual(8);
  });

  it("places female partner on the left of male (not id lexicographic order)", () => {
    const intent = kinshipIntentSchema.parse({
      summary: "Parents with ids that sort male-first alphabetically.",
      people: [
        { id: "ego", role: "ego", sex: "male", isEgo: true },
        { id: "adam", role: "father", sex: "male" },
        { id: "zoe", role: "mother", sex: "female" },
      ],
      partnerRelationships: [{ a: "adam", b: "zoe", status: "married" }],
      parentRelationships: [{ child: "ego", parents: ["adam", "zoe"] }],
      clarifications: [],
    });
    const { nodes } = intentToKinshipGraph(intent);
    const mother = nodes.find((n) => n.id === "zoe");
    const father = nodes.find((n) => n.id === "adam");
    expect(mother?.position.x).toBeLessThan(father!.position.x);
  });
});

describe("orderedPartnerIdsForLayout", () => {
  it("orders female before male regardless of argument order", () => {
    const people = new Map([
      ["m", { id: "m", role: "mother" as const, sex: "female" as const }],
      ["f", { id: "f", role: "father" as const, sex: "male" as const }],
    ]);
    expect(orderedPartnerIdsForLayout("f", "m", people)).toEqual(["m", "f"]);
    expect(orderedPartnerIdsForLayout("m", "f", people)).toEqual(["m", "f"]);
  });

  it("falls back to id order when sex is not both known", () => {
    const people = new Map([
      ["a", { id: "a", role: "cousin" as const, sex: null }],
      ["b", { id: "b", role: "cousin" as const, sex: null }],
    ]);
    expect(orderedPartnerIdsForLayout("b", "a", people)).toEqual(["a", "b"]);
  });
});

describe("merge helpers", () => {
  it("computeSubgraphMergeOffset shifts right of existing symbols", () => {
    const existing: KinshipNode[] = [
      createKinshipNode({
        id: "a",
        symbolType: "female",
        label: "A",
        x: 100,
        y: 50,
      }),
    ];
    const subgraph = [
      createKinshipNode({
        id: "x",
        symbolType: "male",
        label: "X",
        x: 40,
        y: 40,
      }),
    ];
    const { dx } = computeSubgraphMergeOffset(existing, subgraph);
    expect(dx).toBeGreaterThan(0);
    const moved = translateSymbolNodes(subgraph, dx, 0);
    expect(moved[0].position.x).toBeGreaterThan(existing[0].position.x);
  });

  it("remapKinshipIds assigns new ids to nodes and edges", () => {
    const intent = kinshipIntentSchema.parse(sampleFamilyIntent);
    const { nodes, edges } = intentToKinshipGraph(intent);
    const { nodes: n2, edges: e2 } = remapKinshipIds(nodes, edges);
    expect(n2.map((n) => n.id)).not.toEqual(nodes.map((n) => n.id));
    const idSet = new Set(n2.map((n) => n.id));
    expect(idSet.size).toBe(n2.length);
    for (const e of e2) {
      expect(idSet.has(e.source)).toBe(true);
      expect(idSet.has(e.target)).toBe(true);
    }
  });

  it("chartHasEgoSymbol detects ego on canvas", () => {
    const nodes: KinshipNode[] = [
      createKinshipNode({
        id: "e",
        symbolType: "female-ego",
        label: "Ego",
        x: 0,
        y: 0,
      }),
    ];
    expect(chartHasEgoSymbol(nodes)).toBe(true);
    expect(
      chartHasEgoSymbol([
        createKinshipNode({
          id: "m",
          symbolType: "male",
          label: "M",
          x: 0,
          y: 0,
        }),
      ]),
    ).toBe(false);
  });
});
