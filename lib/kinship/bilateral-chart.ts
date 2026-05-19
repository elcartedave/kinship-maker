import { DEFAULT_VIEWPORT } from "./constants";
import { buildChartDocumentSnapshot, createKinshipEdge, createKinshipNode } from "./document";
import { ChartDocument } from "./types";

const DX = 100;
const DY = 180;

export function createBilateralChartDocument(): ChartDocument {
  const y0 = 20;
  const y1 = y0 + DY;
  const y2 = y1 + DY;
  const y3 = y2 + DY;

  // Paternal side - left
  const ffX = 220;
  const fmX = ffX + DX;
  const fzX = 80;
  const fzhX = fzX + DX;
  const fbX = 300;
  const fbwX = fbX + DX;

  // Parents / Ego center
  const fX = 520;
  const mX = fX + DX;

  const egoX = 570;
  const bX = egoX - DX;
  const zX = egoX + DX;

  // Maternal side - right
  const mmX = 820;
  const mfX = mmX + DX;

  const mzX = 760;
  const mzhX = mzX + DX;
  const mbX = 980;
  const mbwX = mbX + DX;

  // Cousins
  const fzsX = fzX + DX * 0.5;
  const fbsX = fbX + DX * 0.5;
  const mzsX = mzX + DX * 0.5;
  const mbsX = mbX + DX * 0.5;

  const nodes = [
    createKinshipNode({ id: "ff", symbolType: "male", label: "FF", x: ffX, y: y1 }),
    createKinshipNode({ id: "fm", symbolType: "female", label: "FM", x: fmX, y: y1 }),

    // Paternal aunts/uncles
    createKinshipNode({ id: "fz", symbolType: "female", label: "FZ", x: fzX, y: y2 }),
    createKinshipNode({ id: "fzh", symbolType: "male", label: "FZH", x: fzhX, y: y2 }),
    createKinshipNode({ id: "fb", symbolType: "male", label: "FB", x: fbX, y: y2 }),
    createKinshipNode({ id: "fbw", symbolType: "female", label: "FBW", x: fbwX, y: y2 }),

    // Parents
    createKinshipNode({ id: "f", symbolType: "male", label: "F", x: fX, y: y2 }),
    createKinshipNode({ id: "m", symbolType: "female", label: "M", x: mX, y: y2 }),

    createKinshipNode({ id: "mm", symbolType: "female", label: "MM", x: mmX, y: y1 }),
    createKinshipNode({ id: "mf", symbolType: "male", label: "MF", x: mfX, y: y1 }),

    // Maternal aunts/uncles
    createKinshipNode({ id: "mz", symbolType: "female", label: "MZ", x: mzX, y: y2 }),
    createKinshipNode({ id: "mzh", symbolType: "male", label: "MZH", x: mzhX, y: y2 }),
    createKinshipNode({ id: "mb", symbolType: "male", label: "MB", x: mbX, y: y2 }),
    createKinshipNode({ id: "mbw", symbolType: "female", label: "MBW", x: mbwX, y: y2 }),

    // Ego generation
    createKinshipNode({ id: "b", symbolType: "male", label: "B", x: bX, y: y3 }),
    createKinshipNode({ id: "ego", symbolType: "male-ego", label: "Ego", x: egoX, y: y3 }),
    createKinshipNode({ id: "z", symbolType: "female", label: "Z", x: zX, y: y3 }),

    // Cousins
    createKinshipNode({ id: "fzs", symbolType: "male", label: "FZS", x: fzsX, y: y3 }),
    createKinshipNode({ id: "fbs", symbolType: "male", label: "FBS", x: fbsX, y: y3 }),
    createKinshipNode({ id: "mzs", symbolType: "male", label: "MZS", x: mzsX, y: y3 }),
    createKinshipNode({ id: "mbs", symbolType: "male", label: "MBS", x: mbsX, y: y3 }),
  ];

  const edges = [
    ...(["ff"] as const).flatMap((child) => [
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

    ...(["mm"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-mmm-${child}`,
        source: "mmm",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-mmf-${child}`,
        source: "mmf",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),

    createKinshipEdge({
      id: "e-mm-mf",
      source: "mm",
      sourceHandle: "right",
      target: "mf",
      targetHandle: "left",
      relationshipType: "married",
    }),

    ...(["m", "mz", "mb"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-mm-${child}`,
        source: "mm",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-mf-${child}`,
        source: "mf",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),

    createKinshipEdge({
      id: "e-f-m",
      source: "f",
      sourceHandle: "right",
      target: "m",
      targetHandle: "left",
      relationshipType: "married",
    }),

    createKinshipEdge({
      id: "e-fz-fzh",
      source: "fz",
      sourceHandle: "right",
      target: "fzh",
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
      id: "e-mz-mzh",
      source: "mz",
      sourceHandle: "right",
      target: "mzh",
      targetHandle: "left",
      relationshipType: "married",
    }),

    createKinshipEdge({
      id: "e-mb-mbw",	
      source: "mb",
      sourceHandle: "right",
      target: "mbw",
      targetHandle: "left",
      relationshipType: "married",
    }),

    ...(["b", "ego", "z"] as const).flatMap((child) => [
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

		...(["fzs"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-fz-${child}`,
        source: "fz",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-fzh-${child}`,
        source: "fzh",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),

		...(["fbs"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-fb-${child}`,
        source: "fb",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-fbw-${child}`,
        source: "fbw",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),

		...(["mzs"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-mz-${child}`,
        source: "mz",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-mzh-${child}`,
        source: "mzh",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),

		...(["mbs"] as const).flatMap((child) => [
      createKinshipEdge({
        id: `e-mb-${child}`,
        source: "mb",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
      createKinshipEdge({
        id: `e-mbw-${child}`,
        source: "mbw",
        sourceHandle: "bottom",
        target: child,
        targetHandle: "top",
        relationshipType: "descended-from",
      }),
    ]),

  ];

  return buildChartDocumentSnapshot({
    title: "Bilateral chart",
    createdAt: new Date().toISOString(),
    viewport: DEFAULT_VIEWPORT,
    nodes,
    edges,
  });
}