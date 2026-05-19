import { DEFAULT_VIEWPORT } from "./constants";
import { buildChartDocumentSnapshot, createKinshipEdge, createKinshipNode } from "./document";
import { ChartDocument } from "./types";

const DX = 100;
const DY = 180;

/**
 * Patrilineal starter using standard kinship abbreviations:
 * F father, M mother, B brother, Z sister, S son, H husband, W wife;
 * chains read outward (FF = father's father, FZS = father's sister's son).
 */
export function createPatrilinealChartDocument(): ChartDocument {
  const y0 = 20;
  const y1 = y0 + DY;
  const y2 = y1 + DY;
  const y3 = y2 + DY;

  const fffX = 280;
  const ffmX = fffX + DX;

  const ffX = 400;
  const fmX = ffX + DX;
  const ffzX = 120;
  const ffbX = 270;

  const fzX = 50;
  const fzhX = fzX + DX;
  const fbX = 250;
  const fbwX = fbX + DX;
  const fX = 450;
  const mX = fX + DX;

  const mid = fX + DX * 0.45;
  const egoX = mid - 0.55 * DX;
  const zX = mid + 0.55 * DX;
  const b2X = mid + 1.65 * DX;
  const fzsX = fzX + DX * 0.5;
  const fbsX = fbX + DX * 0.5;

  const nodes = [
    createKinshipNode({ id: "fff", symbolType: "male", label: "FFF", x: fffX, y: y0 }),
    createKinshipNode({ id: "ffm", symbolType: "female", label: "FFM", x: ffmX, y: y0 }),
    createKinshipNode({ id: "ffz", symbolType: "female", label: "FFZ", x: ffzX, y: y1 }),
    createKinshipNode({ id: "ff", symbolType: "male", label: "FF", x: ffX, y: y1 }),
    createKinshipNode({ id: "fm", symbolType: "female", label: "FM", x: fmX, y: y1 }),
    createKinshipNode({ id: "ffb", symbolType: "male", label: "FFB", x: ffbX, y: y1 }),
    createKinshipNode({ id: "fz", symbolType: "female", label: "FZ", x: fzX, y: y2 }),
    createKinshipNode({ id: "fzh", symbolType: "male", label: "FZH", x: fzhX, y: y2 }),
    createKinshipNode({ id: "f", symbolType: "male", label: "F", x: fX, y: y2 }),
    createKinshipNode({ id: "m", symbolType: "female", label: "M", x: mX, y: y2 }),
    createKinshipNode({ id: "fb", symbolType: "male", label: "FB", x: fbX, y: y2 }),
    createKinshipNode({ id: "fbw", symbolType: "female", label: "FBW", x: fbwX, y: y2 }),
    createKinshipNode({ id: "ego", symbolType: "male-ego", label: "Ego", x: egoX, y: y3 }),
    createKinshipNode({ id: "z", symbolType: "female", label: "Z", x: zX, y: y3 }),
    createKinshipNode({ id: "b2", symbolType: "male", label: "B", x: b2X, y: y3 }),
    createKinshipNode({ id: "fzs", symbolType: "male", label: "FZS", x: fzsX, y: y3 }),
    createKinshipNode({ id: "fbs", symbolType: "male", label: "FBS", x: fbsX, y: y3 }),
  ];

  const edges = [
    createKinshipEdge({
      id: "e-fff-ffm",
      source: "fff",
      sourceHandle: "right",
      target: "ffm",
      targetHandle: "left",
      relationshipType: "married",
    }),
    ...(["ff", "ffz", "ffb"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-fff-${child}`,
        source: "fff",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-ffm-${child}`,
        source: "ffm",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),
    createKinshipEdge({
      id: "e-ff-fm",
      source: "ff",
      sourceHandle: "right",
      target: "fm",
      targetHandle: "left",
      relationshipType: "married",
    }),
    ...(["f", "fz", "fb"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-ff-${child}`,
        source: "ff",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-fm-${child}`,
        source: "fm",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),
    createKinshipEdge({
      id: "e-fz-fzh",
      source: "fz",
      sourceHandle: "right",
      target: "fzh",
      targetHandle: "left",
      relationshipType: "married",
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
      id: "e-fb-fbw",
      source: "fb",
      sourceHandle: "right",
      target: "fbw",
      targetHandle: "left",
      relationshipType: "married",
    }),
    createKinshipEdge({
      id: "e-fz-fzs",
      source: "fz",
      sourceHandle: "bottom",
      target: "fzs",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-fzh-fzs",
      source: "fzh",
      sourceHandle: "bottom",
      target: "fzs",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-fb-fbs",
      source: "fb",
      sourceHandle: "bottom",
      target: "fbs",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    createKinshipEdge({
      id: "e-fbw-fbs",
      source: "fbw",
      sourceHandle: "bottom",
      target: "fbs",
      targetHandle: "top",
      relationshipType: "descended-from",
    }),
    ...(["ego", "z", "b2"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-f-${child}`,
        source: "f",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-m-${child}`,
        source: "m",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),
  ];

  return buildChartDocumentSnapshot({
    title: "Patrilineal chart",
    createdAt: new Date().toISOString(),
    viewport: DEFAULT_VIEWPORT,
    nodes,
    edges,
  });
}
