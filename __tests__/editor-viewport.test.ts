import { describe, expect, test } from "vitest";

import { createKinshipNode } from "@/lib/kinship/document";
import {
  computeEgoBiasedViewport,
  getEgoTargetScreenPoint,
  getPrimaryEgoNodeId,
  sanitizeChartViewport,
} from "@/lib/kinship/editor-viewport";
import {
  DEFAULT_VIEWPORT,
  EDITOR_VIEWPORT_EGO_BIAS_X_PX,
  EDITOR_VIEWPORT_LEFT_INSET_PX,
  EDITOR_VIEWPORT_RIGHT_INSET_PX,
} from "@/lib/kinship/constants";

describe("sanitizeChartViewport", () => {
  test("falls back to DEFAULT_VIEWPORT for non-finite or missing values", () => {
    expect(sanitizeChartViewport(null)).toEqual(DEFAULT_VIEWPORT);
    expect(sanitizeChartViewport(undefined)).toEqual(DEFAULT_VIEWPORT);
    expect(sanitizeChartViewport({})).toEqual(DEFAULT_VIEWPORT);
    expect(sanitizeChartViewport({ x: NaN, y: NaN, zoom: NaN })).toEqual(
      DEFAULT_VIEWPORT,
    );
    expect(
      sanitizeChartViewport({ x: 100, y: null as unknown as number, zoom: 1 }),
    ).toEqual({ x: 100, y: DEFAULT_VIEWPORT.y, zoom: 1 });
    expect(sanitizeChartViewport({ x: 0, y: 0, zoom: 0 })).toEqual({
      x: 0,
      y: 0,
      zoom: DEFAULT_VIEWPORT.zoom,
    });
    expect(
      sanitizeChartViewport({ x: Infinity, y: -Infinity, zoom: 1.5 }),
    ).toEqual({ x: DEFAULT_VIEWPORT.x, y: DEFAULT_VIEWPORT.y, zoom: 1.5 });
  });

  test("preserves valid finite values unchanged", () => {
    expect(sanitizeChartViewport({ x: 12, y: -34, zoom: 1.4 })).toEqual({
      x: 12,
      y: -34,
      zoom: 1.4,
    });
  });
});

describe("getPrimaryEgoNodeId", () => {
  test("returns first ego node id", () => {
    const nodes = [
      createKinshipNode({ id: "a", symbolType: "female", x: 0, y: 0 }),
      createKinshipNode({ id: "ego", symbolType: "male-ego", x: 100, y: 100 }),
    ];
    expect(getPrimaryEgoNodeId(nodes)).toBe("ego");
  });

  test("returns null when no ego", () => {
    const nodes = [createKinshipNode({ id: "a", symbolType: "female", x: 0, y: 0 })];
    expect(getPrimaryEgoNodeId(nodes)).toBeNull();
  });
});

describe("getEgoTargetScreenPoint", () => {
  test("shifts target right of usable center on large viewport", () => {
    const flowWidth = 1200;
    const flowHeight = 800;
    const windowWidth = 1400;
    const left = EDITOR_VIEWPORT_LEFT_INSET_PX;
    const right = EDITOR_VIEWPORT_RIGHT_INSET_PX;
    const usableWidth = flowWidth - left - right;
    const expectedCenterX = left + usableWidth / 2;
    const { targetX, targetY } = getEgoTargetScreenPoint(
      flowWidth,
      flowHeight,
      windowWidth,
    );
    expect(targetY).toBe(flowHeight / 2);
    expect(targetX).toBe(expectedCenterX + EDITOR_VIEWPORT_EGO_BIAS_X_PX);
  });
});

describe("computeEgoBiasedViewport", () => {
  test("returns null for empty nodes", () => {
    expect(
      computeEgoBiasedViewport({
        mode: "fit",
        nodes: [],
        flowWidth: 1000,
        flowHeight: 800,
        windowWidth: 1400,
        minZoom: 0.2,
        maxZoom: 2.25,
      }),
    ).toBeNull();
  });

  test("defaultZoom uses fixed zoom and biases ego on large window", () => {
    const ego = createKinshipNode({
      id: "ego",
      symbolType: "female-ego",
      x: 200,
      y: 240,
    });
    const vp = computeEgoBiasedViewport({
      mode: "defaultZoom",
      nodes: [ego],
      flowWidth: 1200,
      flowHeight: 800,
      windowWidth: 1400,
      minZoom: 0.2,
      maxZoom: 2.25,
    });
    expect(vp).not.toBeNull();
    expect(vp!.zoom).toBe(DEFAULT_VIEWPORT.zoom);
    const egoCx = ego.position.x + (ego.width ?? 116) / 2;
    const egoCy = ego.position.y + (ego.height ?? 116) / 2;
    const { targetX, targetY } = getEgoTargetScreenPoint(1200, 800, 1400);
    expect(vp!.x + egoCx * vp!.zoom).toBeCloseTo(targetX, 0);
    expect(vp!.y + egoCy * vp!.zoom).toBeCloseTo(targetY, 0);
  });

  test("fit mode without ego uses asymmetric padding viewport", () => {
    const nodes = [
      createKinshipNode({ id: "a", symbolType: "female", x: 0, y: 0 }),
      createKinshipNode({ id: "b", symbolType: "male", x: 400, y: 200 }),
    ];
    const vp = computeEgoBiasedViewport({
      mode: "fit",
      nodes,
      flowWidth: 1200,
      flowHeight: 800,
      windowWidth: 1400,
      minZoom: 0.2,
      maxZoom: 2.25,
    });
    expect(vp).not.toBeNull();
    expect(vp!.zoom).toBeGreaterThanOrEqual(0.2);
    expect(vp!.zoom).toBeLessThanOrEqual(2.25);
  });
});
