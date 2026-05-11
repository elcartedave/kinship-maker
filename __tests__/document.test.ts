import { describe, expect, test } from "vitest";

import {
  buildChartDocumentSnapshot,
  createChartRecord,
  createEmptyChartDocument,
  createKinshipEdge,
  createKinshipNode,
  createConflictCopy,
  normaliseTitle,
} from "@/lib/kinship/document";
import { DEFAULT_VIEWPORT } from "@/lib/kinship/constants";

describe("document helpers", () => {
  test("creates an empty chart document", () => {
    const document = createEmptyChartDocument("Test chart");

    expect(document.meta.title).toBe("Test chart");
    expect(document.nodes).toEqual([]);
    expect(document.edges).toEqual([]);
    expect(document.viewport).toEqual(DEFAULT_VIEWPORT);
  });

  test("builds a chart snapshot with updated metadata", () => {
    const document = buildChartDocumentSnapshot({
      title: "Lineage",
      createdAt: "2026-05-08T00:00:00.000Z",
      viewport: DEFAULT_VIEWPORT,
      nodes: [
        createKinshipNode({
          id: "one",
          symbolType: "female",
          label: "F",
          x: 0,
          y: 0,
        }),
      ],
      edges: [
        createKinshipEdge({
          id: "edge",
          source: "one",
          target: "two",
          relationshipType: "descended-from",
        }),
      ],
    });

    expect(document.version).toBe(1);
    expect(document.meta.title).toBe("Lineage");
    expect(document.meta.createdAt).toBe("2026-05-08T00:00:00.000Z");
    expect(document.edges[0].type).toBe("descended-from");
  });

  test("creates a conflict copy with a new id and updated title", () => {
    const base = createChartRecord("Kinship reference");
    const copy = createConflictCopy(base);

    expect(copy.id).not.toBe(base.id);
    expect(copy.title).toContain("Conflict copy");
    expect(copy.cloudId).toBeUndefined();
    expect(copy.dirty).toBe(true);
  });

  test("normalises blank titles", () => {
    expect(normaliseTitle("   ")).toBe("Untitled chart");
  });
});
