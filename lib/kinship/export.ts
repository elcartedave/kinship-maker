"use client";

import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

import {
  EXPORT_BACKGROUND,
  EXPORT_PADDING,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "@/lib/kinship/constants";
import type { KinshipNode } from "@/lib/kinship/types";

function toFileName(title: string, extension: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "kinship-chart"}.${extension}`;
}

export function getExportFrame(nodes: KinshipNode[]) {
  if (nodes.length === 0) {
    throw new Error("Add at least one symbol before exporting.");
  }

  const bounds = getNodesBounds(
    nodes.map((node) => ({
      ...node,
      width: node.width ?? NODE_WIDTH,
      height: node.height ?? NODE_HEIGHT,
    })),
  );

  const width = Math.max(Math.ceil(bounds.width + EXPORT_PADDING * 2), 320);
  const height = Math.max(Math.ceil(bounds.height + EXPORT_PADDING * 2), 240);
  const viewport = getViewportForBounds(bounds, width, height, 0.1, 2, 0.08);

  return {
    bounds,
    width,
    height,
    viewport,
  };
}

async function createCanvasDataUrl(
  viewportElement: HTMLElement,
  nodes: KinshipNode[],
) {
  const frame = getExportFrame(nodes);

  const dataUrl = await toPng(viewportElement, {
    backgroundColor: EXPORT_BACKGROUND,
    filter: (node) =>
      !(
        node instanceof HTMLElement &&
        (node.classList.contains("react-flow__handle") ||
          node.classList.contains("kinship-export-hidden"))
      ),
    pixelRatio: 2,
    width: frame.width,
    height: frame.height,
    style: {
      background: EXPORT_BACKGROUND,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      transform: `translate(${frame.viewport.x}px, ${frame.viewport.y}px) scale(${frame.viewport.zoom})`,
    },
  });

  return {
    dataUrl,
    ...frame,
  };
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

export async function exportChartAsPng(
  viewportElement: HTMLElement,
  nodes: KinshipNode[],
  title: string,
) {
  const { dataUrl } = await createCanvasDataUrl(viewportElement, nodes);
  downloadDataUrl(dataUrl, toFileName(title, "png"));
}

export async function exportChartAsPdf(
  viewportElement: HTMLElement,
  nodes: KinshipNode[],
  title: string,
) {
  const { dataUrl, height, width } = await createCanvasDataUrl(
    viewportElement,
    nodes,
  );

  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    hotfixes: ["px_scaling"],
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  pdf.save(toFileName(title, "pdf"));
}
