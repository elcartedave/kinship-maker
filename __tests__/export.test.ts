import { describe, expect, test } from "vitest";

import { getExportFrame } from "@/lib/kinship/export";
import { createKinshipNode } from "@/lib/kinship/document";

describe("export bounds", () => {
  test("expands the frame around all nodes with padding", () => {
    const nodes = [
      createKinshipNode({
        id: "one",
        symbolType: "female",
        label: "F",
        x: 0,
        y: 0,
      }),
      createKinshipNode({
        id: "two",
        symbolType: "male",
        label: "M",
        x: 400,
        y: 300,
      }),
    ];

    const frame = getExportFrame(nodes);

    expect(frame.width).toBeGreaterThan(500);
    expect(frame.height).toBeGreaterThan(380);
    expect(frame.viewport.zoom).toBeGreaterThan(0);
  });
});
