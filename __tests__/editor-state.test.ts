import { describe, expect, test } from "vitest";

import { createKinshipNode } from "@/lib/kinship/document";
import { duplicateNode, updateNodeData } from "@/lib/kinship/editor-state";

describe("editor state helpers", () => {
  test("updates a node label without disturbing others", () => {
    const nodes = [
      createKinshipNode({
        id: "one",
        symbolType: "female",
        label: "A",
        x: 0,
        y: 0,
      }),
      createKinshipNode({
        id: "two",
        symbolType: "male",
        label: "B",
        x: 10,
        y: 10,
      }),
    ];

    const updated = updateNodeData(nodes, "one", { label: "AA" });

    expect(updated[0].data.label).toBe("AA");
    expect(updated[1].data.label).toBe("B");
  });

  test("duplicates a selected node with an offset", () => {
    const nodes = [
      createKinshipNode({
        id: "one",
        symbolType: "female",
        label: "A",
        x: 10,
        y: 15,
      }),
    ];

    const duplicated = duplicateNode(nodes, "one");

    expect(duplicated.nodes).toHaveLength(2);
    expect(duplicated.createdId).toBeTruthy();
    expect(duplicated.nodes[1].position.x).toBe(58);
    expect(duplicated.nodes[1].position.y).toBe(63);
  });
});
