import { getNodesBounds, getViewportForBounds } from "@xyflow/react";

import {
  DEFAULT_VIEWPORT,
  EDITOR_VIEWPORT_EDGE_MARGIN_PX,
  EDITOR_VIEWPORT_EGO_BIAS_X_PX,
  EDITOR_VIEWPORT_LEFT_INSET_PX,
  EDITOR_VIEWPORT_LG_BREAKPOINT_PX,
  EDITOR_VIEWPORT_RIGHT_INSET_PX,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "@/lib/kinship/constants";
import { filterSymbolNodes, isEgoSymbolType } from "@/lib/kinship/symbols";
import type { ChartViewport, KinshipNode } from "@/lib/kinship/types";

export type EgoViewportMode = "fit" | "defaultZoom";

/**
 * Returns a viewport guaranteed to have finite numeric x / y / zoom. Useful at
 * persistence and React Flow boundaries: `JSON.stringify` converts `NaN` to
 * `null` (so old saves can come back as `{ x: null, y: null, zoom: 1.15 }`),
 * and React Flow's Background `<pattern>` and MiniMap `<rect>` set their
 * `x`/`y` SVG attributes from the live viewport — non-finite values produce
 * the React DOM `Received NaN for the 'x' attribute` warning.
 */
export function sanitizeChartViewport(value: unknown): ChartViewport {
  const v = (value ?? {}) as Partial<ChartViewport>;
  const x = typeof v.x === "number" && Number.isFinite(v.x) ? v.x : DEFAULT_VIEWPORT.x;
  const y = typeof v.y === "number" && Number.isFinite(v.y) ? v.y : DEFAULT_VIEWPORT.y;
  const zoom =
    typeof v.zoom === "number" && Number.isFinite(v.zoom) && v.zoom > 0
      ? v.zoom
      : DEFAULT_VIEWPORT.zoom;
  return { x, y, zoom };
}

export function getPrimaryEgoNodeId(nodes: KinshipNode[]): string | null {
  const ego = filterSymbolNodes(nodes).find((node) =>
    isEgoSymbolType(node.data.symbolType),
  );
  return ego?.id ?? null;
}

function nodeCenterFlow(node: KinshipNode) {
  const w = node.width ?? NODE_WIDTH;
  const h = node.height ?? NODE_HEIGHT;
  return {
    x: node.position.x + w / 2,
    y: node.position.y + h / 2,
  };
}

/** Horizontal chrome from palette / inspector on large screens; small margins on mobile. */
export function getEditorHorizontalInsets(windowWidth: number) {
  if (windowWidth >= EDITOR_VIEWPORT_LG_BREAKPOINT_PX) {
    return {
      left: EDITOR_VIEWPORT_LEFT_INSET_PX,
      right: EDITOR_VIEWPORT_RIGHT_INSET_PX,
    };
  }
  return {
    left: EDITOR_VIEWPORT_EDGE_MARGIN_PX,
    right: EDITOR_VIEWPORT_EDGE_MARGIN_PX,
  };
}

/** Screen-space point (relative to flow pane top-left) where the ego should sit. */
export function getEgoTargetScreenPoint(
  flowWidth: number,
  flowHeight: number,
  windowWidth: number,
) {
  const { left, right } = getEditorHorizontalInsets(windowWidth);
  const usableWidth = Math.max(1, flowWidth - left - right);
  const usableCenterX = left + usableWidth / 2;
  const targetX = usableCenterX + EDITOR_VIEWPORT_EGO_BIAS_X_PX;
  const targetY = flowHeight / 2;
  return { targetX, targetY };
}

function clampPanToBounds(
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  flowWidth: number,
  flowHeight: number,
  margin: number,
  vx: number,
  vy: number,
) {
  const vxMin = margin - bounds.x * zoom;
  const vxMax = flowWidth - margin - (bounds.x + bounds.width) * zoom;
  const vyMin = margin - bounds.y * zoom;
  const vyMax = flowHeight - margin - (bounds.y + bounds.height) * zoom;
  return {
    x: Math.min(Math.max(vx, vxMin), vxMax),
    y: Math.min(Math.max(vy, vyMin), vyMax),
  };
}

function zoomToFitBoundsInRect(
  bounds: { width: number; height: number },
  innerWidth: number,
  innerHeight: number,
  minZoom: number,
  maxZoom: number,
) {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return minZoom;
  }
  const m = EDITOR_VIEWPORT_EDGE_MARGIN_PX;
  const zw = (innerWidth - 2 * m) / bounds.width;
  const zh = (innerHeight - 2 * m) / bounds.height;
  return Math.min(maxZoom, Math.max(minZoom, Math.min(zw, zh)));
}

/**
 * Computes a viewport that keeps all nodes visible when possible, and places
 * the primary ego near a biased screen target (usable band + horizontal bias).
 * Falls back to {@link DEFAULT_VIEWPORT} in defaultZoom mode with no ego.
 */
export function computeEgoBiasedViewport({
  mode,
  nodes,
  flowWidth,
  flowHeight,
  windowWidth,
  minZoom,
  maxZoom,
}: {
  mode: EgoViewportMode;
  nodes: KinshipNode[];
  flowWidth: number;
  flowHeight: number;
  windowWidth: number;
  minZoom: number;
  maxZoom: number;
}): ChartViewport | null {
  if (nodes.length === 0 || flowWidth <= 0 || flowHeight <= 0) {
    return null;
  }

  const bounds = getNodesBounds(nodes);
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const egoId = getPrimaryEgoNodeId(nodes);
  const egoNode = egoId ? nodes.find((n) => n.id === egoId) : undefined;

  const margin = EDITOR_VIEWPORT_EDGE_MARGIN_PX;
  const { left: leftInset, right: rightInset } = getEditorHorizontalInsets(windowWidth);
  const usableInnerWidth = Math.max(1, flowWidth - leftInset - rightInset);
  const usableInnerHeight = Math.max(1, flowHeight - 2 * margin);

  if (!egoNode) {
    if (mode === "defaultZoom") {
      return sanitizeChartViewport(DEFAULT_VIEWPORT);
    }
    return sanitizeChartViewport(
      getViewportForBounds(bounds, flowWidth, flowHeight, minZoom, maxZoom, {
        left: leftInset + margin,
        right: rightInset + margin,
        top: margin,
        bottom: margin,
      }),
    );
  }

  const egoCenter = nodeCenterFlow(egoNode);
  const { targetX, targetY } = getEgoTargetScreenPoint(flowWidth, flowHeight, windowWidth);

  if (mode === "defaultZoom") {
    const zoom = DEFAULT_VIEWPORT.zoom;
    const vx = targetX - egoCenter.x * zoom;
    const vy = targetY - egoCenter.y * zoom;
    const clamped = clampPanToBounds(bounds, zoom, flowWidth, flowHeight, margin, vx, vy);
    return sanitizeChartViewport({ x: clamped.x, y: clamped.y, zoom });
  }

  // fit: maximize zoom subject to fitting bounds in usable inner rect, then bias pan toward ego.
  let zoom = zoomToFitBoundsInRect(
    bounds,
    usableInnerWidth,
    usableInnerHeight,
    minZoom,
    maxZoom,
  );

  let vx = targetX - egoCenter.x * zoom;
  let vy = targetY - egoCenter.y * zoom;
  let clamped = clampPanToBounds(bounds, zoom, flowWidth, flowHeight, margin, vx, vy);

  // If clamping moved us a lot, try slightly lower zoom to loosen horizontal/vertical slack.
  for (let i = 0; i < 12 && zoom > minZoom * 1.001; i += 1) {
    const slack =
      Math.abs(clamped.x - vx) + Math.abs(clamped.y - vy);
    if (slack < 0.5) {
      break;
    }
    zoom *= 0.97;
    zoom = Math.max(minZoom, zoom);
    vx = targetX - egoCenter.x * zoom;
    vy = targetY - egoCenter.y * zoom;
    clamped = clampPanToBounds(bounds, zoom, flowWidth, flowHeight, margin, vx, vy);
  }

  return sanitizeChartViewport({ x: clamped.x, y: clamped.y, zoom });
}
