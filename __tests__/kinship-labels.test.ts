import { describe, expect, test } from "vitest";

import { createKinshipEdge, createKinshipNode } from "@/lib/kinship/document";
import { deriveKinshipLabels } from "@/lib/kinship/kinship-labels";
import { getKinshipGender } from "@/lib/kinship/symbols";

describe("kinship label derivation", () => {
  test("derives direct and extended kin labels from the primary ego", () => {
    const nodes = [
      createKinshipNode({ id: "mf", symbolType: "male", label: "", x: 0, y: 0 }),
      createKinshipNode({ id: "mm", symbolType: "female", label: "", x: 80, y: 0 }),
      createKinshipNode({ id: "ff", symbolType: "male", label: "", x: 240, y: 0 }),
      createKinshipNode({ id: "fm", symbolType: "female", label: "", x: 320, y: 0 }),
      createKinshipNode({ id: "m", symbolType: "female", label: "", x: 40, y: 140 }),
      createKinshipNode({ id: "mz", symbolType: "female", label: "", x: 120, y: 140 }),
      createKinshipNode({ id: "f", symbolType: "male", label: "", x: 280, y: 140 }),
      createKinshipNode({ id: "fb", symbolType: "male", label: "", x: 360, y: 140 }),
      createKinshipNode({ id: "ego", symbolType: "male-ego", label: "", x: 200, y: 280 }),
      createKinshipNode({ id: "z", symbolType: "female", label: "", x: 120, y: 280 }),
      createKinshipNode({ id: "b", symbolType: "male", label: "", x: 280, y: 280 }),
      createKinshipNode({ id: "w", symbolType: "female", label: "", x: 360, y: 280 }),
      createKinshipNode({ id: "s", symbolType: "male", label: "", x: 200, y: 420 }),
      createKinshipNode({ id: "d", symbolType: "female", label: "", x: 280, y: 420 }),
      createKinshipNode({ id: "mzs", symbolType: "male", label: "", x: 120, y: 420 }),
      createKinshipNode({ id: "fbd", symbolType: "female", label: "", x: 360, y: 420 }),
      createKinshipNode({
        id: "unrelated",
        symbolType: "female",
        label: "Custom",
        x: 600,
        y: 40,
      }),
    ];

    const edges = [
      createKinshipEdge({
        id: "mf-m",
        source: "mf",
        target: "m",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "mf-mz",
        source: "mf",
        target: "mz",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "mm-m",
        source: "mm",
        target: "m",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "mm-mz",
        source: "mm",
        target: "mz",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "ff-f",
        source: "ff",
        target: "f",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "ff-fb",
        source: "ff",
        target: "fb",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "fm-f",
        source: "fm",
        target: "f",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "fm-fb",
        source: "fm",
        target: "fb",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "m-ego",
        source: "m",
        target: "ego",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "f-ego",
        source: "f",
        target: "ego",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "m-z",
        source: "m",
        target: "z",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "f-z",
        source: "f",
        target: "z",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "m-b",
        source: "m",
        target: "b",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "f-b",
        source: "f",
        target: "b",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "mz-mzs",
        source: "mz",
        target: "mzs",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "fb-fbd",
        source: "fb",
        target: "fbd",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "ego-w",
        source: "ego",
        target: "w",
        relationshipType: "married",
      }),
      createKinshipEdge({
        id: "ego-s",
        source: "ego",
        target: "s",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "w-s",
        source: "w",
        target: "s",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "ego-d",
        source: "ego",
        target: "d",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "w-d",
        source: "w",
        target: "d",
        relationshipType: "descended-from",
      }),
    ];

    const derived = deriveKinshipLabels(nodes, edges).labelsByNodeId;

    expect(derived.ego.abbreviation).toBe("Ego");
    expect(derived.m.abbreviation).toBe("M");
    expect(derived.f.abbreviation).toBe("F");
    expect(derived.z.abbreviation).toBe("Z");
    expect(derived.b.abbreviation).toBe("B");
    expect(derived.mm.abbreviation).toBe("MM");
    expect(derived.mf.abbreviation).toBe("MF");
    expect(derived.mz.abbreviation).toBe("MZ");
    expect(derived.fb.abbreviation).toBe("FB");
    expect(derived.w.abbreviation).toBe("W");
    expect(derived.s.abbreviation).toBe("S");
    expect(derived.d.abbreviation).toBe("D");
    expect(derived.mzs.abbreviation).toBe("MZS");
    expect(derived.fbd.abbreviation).toBe("FBD");
    expect(derived.mzs.description).toBe("Mother's Sister's Son");
    expect(derived.unrelated).toBeUndefined();
  });

  test("returns no derived labels when there is no ego on the chart", () => {
    const nodes = [
      createKinshipNode({ id: "one", symbolType: "female", label: "A", x: 0, y: 0 }),
      createKinshipNode({ id: "two", symbolType: "male", label: "B", x: 0, y: 0 }),
    ];

    expect(deriveKinshipLabels(nodes, []).labelsByNodeId).toEqual({});
  });

  test("infers sibling labels from shared parents and honours partner edges", () => {
    const nodes = [
      createKinshipNode({ id: "m", symbolType: "female", label: "", x: 0, y: 0 }),
      createKinshipNode({ id: "f", symbolType: "male", label: "", x: 0, y: 0 }),
      createKinshipNode({
        id: "ego",
        symbolType: "female-ego",
        label: "",
        x: 0,
        y: 0,
      }),
      createKinshipNode({ id: "brother", symbolType: "male", label: "", x: 0, y: 0 }),
      createKinshipNode({ id: "partner", symbolType: "male", label: "", x: 0, y: 0 }),
    ];
    const edges = [
      createKinshipEdge({
        id: "m-ego",
        source: "m",
        target: "ego",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "m-brother",
        source: "m",
        target: "brother",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "f-ego",
        source: "f",
        target: "ego",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "f-brother",
        source: "f",
        target: "brother",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: "ego-partner",
        source: "ego",
        target: "partner",
        relationshipType: "married",
      }),
    ];

    const derived = deriveKinshipLabels(nodes, edges).labelsByNodeId;

    expect(derived.brother.abbreviation).toBe("B");
    expect(derived.partner.abbreviation).toBe("H");
  });

  test("maps symbol types to the correct kinship gender", () => {
    expect(getKinshipGender("female")).toBe("female");
    expect(getKinshipGender("male")).toBe("male");
    expect(getKinshipGender("deceased-female")).toBe("female");
    expect(getKinshipGender("adopted-male")).toBe("male");
  });
});
