import { DEFAULT_VIEWPORT } from "@/lib/kinship/constants";
import {
  buildChartDocumentSnapshot,
  createKinshipEdge,
  createKinshipNode,
} from "@/lib/kinship/document";
import type { ChartDocument } from "@/lib/kinship/types";

export function createSampleChartDocument(): ChartDocument {
  const nodes = [
    createKinshipNode({
      id: "ff",
      symbolType: "male",
      label: "FF",
      x: 40,
      y: 20,
    }),
    createKinshipNode({
      id: "fm",
      symbolType: "female",
      label: "FM",
      x: 230,
      y: 20,
    }),
    createKinshipNode({
      id: "f",
      symbolType: "male",
      label: "F",
      x: 135,
      y: 220,
    }),
    createKinshipNode({
      id: "m",
      symbolType: "female",
      label: "M",
      x: 470,
      y: 220,
    }),
    createKinshipNode({
      id: "b",
      symbolType: "male",
      label: "B",
      x: 245,
      y: 420,
    }),
    createKinshipNode({
      id: "ego",
      symbolType: "male-ego",
      label: "Ego",
      x: 470,
      y: 420,
    }),
    createKinshipNode({
      id: "z",
      symbolType: "female",
      label: "Z",
      x: 695,
      y: 420,
    }),
  ];

  const edges = [
    createKinshipEdge({
      id: "e-ff-fm",
      source: "ff",
      sourceHandle: "right",
      target: "fm",
      targetHandle: "left",
      relationshipType: "married",
    }),
    createKinshipEdge({
      id: "e-ff-f",
      source: "ff",
      sourceHandle: "bottom",
      target: "f",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-fm-f",
      source: "fm",
      sourceHandle: "bottom",
      target: "f",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-f-m",
      source: "f",
      sourceHandle: "right",
      target: "m",
      targetHandle: "left",
      relationshipType: "married",
    }),
    createKinshipEdge({
      id: "e-f-b",
      source: "f",
      sourceHandle: "bottom",
      target: "b",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-m-b",
      source: "m",
      sourceHandle: "bottom",
      target: "b",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-f-ego",
      source: "f",
      sourceHandle: "bottom",
      target: "ego",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-m-ego",
      source: "m",
      sourceHandle: "bottom",
      target: "ego",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-f-z",
      source: "f",
      sourceHandle: "bottom",
      target: "z",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-m-z",
      source: "m",
      sourceHandle: "bottom",
      target: "z",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
  ];

  return buildChartDocumentSnapshot({
    title: "Sample kinship chart",
    createdAt: new Date().toISOString(),
    viewport: DEFAULT_VIEWPORT,
    nodes,
    edges,
  });
}
