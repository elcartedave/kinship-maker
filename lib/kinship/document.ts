import { Position } from "@xyflow/react";

import {
  DEFAULT_TEXT_NODE_DATA,
  DEFAULT_VIEWPORT,
  NODE_HEIGHT,
  NODE_WIDTH,
  TEXT_FONT_FAMILIES,
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  TEXT_NODE_INITIAL_HEIGHT,
  TEXT_NODE_INITIAL_WIDTH,
} from "@/lib/kinship/constants";
import { isTextNode } from "@/lib/kinship/symbols";
import {
  KINSHIP_RELATIONSHIP_TYPES,
  KINSHIP_NODE_TYPE,
  KINSHIP_TEXT_NODE_TYPE,
  type ChartDocument,
  type ChartRecord,
  type ChartViewport,
  type KinshipEdge,
  type KinshipEdgeData,
  type KinshipNode,
  type KinshipNodeData,
  type KinshipRelationshipType,
  type KinshipSymbolNode,
  type KinshipSymbolType,
  type KinshipTextNode,
  type KinshipTextNodeData,
} from "@/lib/kinship/types";

function nowIso() {
  return new Date().toISOString();
}

export function cloneChartDocument(document: ChartDocument): ChartDocument {
  return structuredClone(document);
}

export function normaliseTitle(title: string) {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : "Untitled chart";
}

export function createKinshipNodeData(
  symbolType: KinshipSymbolType,
  label = "",
): KinshipNodeData {
  return {
    symbolType,
    label,
  };
}

export function createKinshipNode({
  id,
  symbolType,
  label = "",
  x,
  y,
  notes,
}: {
  id: string;
  symbolType: KinshipSymbolType;
  label?: string;
  x: number;
  y: number;
  notes?: string;
}): KinshipSymbolNode {
  return {
    id,
    type: KINSHIP_NODE_TYPE,
    position: { x, y },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    style: {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    },
    data: {
      symbolType,
      label,
      notes,
    },
  };
}

export function createKinshipEdge({
  id,
  source,
  target,
  relationshipType,
  label,
  sourceHandle,
  targetHandle,
}: {
  id: string;
  source: string;
  target: string;
  relationshipType: KinshipRelationshipType;
  label?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}): KinshipEdge {
  const data: KinshipEdgeData = {
    relationshipType,
    label,
  };

  return {
    id,
    type: relationshipType,
    source,
    target,
    sourceHandle,
    targetHandle,
    data,
  };
}

/**
 * Builds a text-annotation node. Position is the *top-left* of the wrapper —
 * callers that want the drop to feel centered on the cursor should subtract
 * half of {@link TEXT_NODE_INITIAL_WIDTH} / {@link TEXT_NODE_INITIAL_HEIGHT}
 * before passing in `x` / `y`.
 */
export function createKinshipTextNode({
  id,
  x,
  y,
  width = TEXT_NODE_INITIAL_WIDTH,
  height = TEXT_NODE_INITIAL_HEIGHT,
  data,
}: {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  data?: Partial<KinshipTextNodeData>;
}): KinshipTextNode {
  return {
    id,
    type: KINSHIP_TEXT_NODE_TYPE,
    position: { x, y },
    width,
    height,
    style: {
      width,
      height,
    },
    data: {
      ...DEFAULT_TEXT_NODE_DATA,
      ...data,
    },
  };
}

const FONT_FAMILY_IDS = new Set(TEXT_FONT_FAMILIES.map((font) => font.id));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeTextNodeData(
  raw: Partial<KinshipTextNodeData> | undefined,
): KinshipTextNodeData {
  const data = raw ?? {};
  const fontFamily =
    typeof data.fontFamily === "string" && FONT_FAMILY_IDS.has(data.fontFamily)
      ? data.fontFamily
      : DEFAULT_TEXT_NODE_DATA.fontFamily;
  const rawSize =
    typeof data.fontSize === "number" && Number.isFinite(data.fontSize)
      ? data.fontSize
      : DEFAULT_TEXT_NODE_DATA.fontSize;
  const fontSize = clamp(
    Math.round(rawSize),
    TEXT_FONT_SIZE_MIN,
    TEXT_FONT_SIZE_MAX,
  );
  const fontWeight =
    typeof data.fontWeight === "number" && Number.isFinite(data.fontWeight)
      ? clamp(Math.round(data.fontWeight), 100, 900)
      : DEFAULT_TEXT_NODE_DATA.fontWeight;
  const fontStyle =
    data.fontStyle === "italic" ? "italic" : "normal";
  const color =
    typeof data.color === "string" && data.color.length > 0
      ? data.color
      : DEFAULT_TEXT_NODE_DATA.color;
  const text = typeof data.text === "string" ? data.text : DEFAULT_TEXT_NODE_DATA.text;
  // Normalize rotation into [-180, 180]. We accept any finite degree from
  // older saves (could be 540, -720, etc. — wraps round to the same visual
  // angle) and round to whole degrees so undo/redo doesn't accumulate noise.
  const rotation = (() => {
    if (typeof data.rotation !== "number" || !Number.isFinite(data.rotation)) {
      return 0;
    }
    const wrapped = ((data.rotation % 360) + 360) % 360;
    return Math.round(wrapped > 180 ? wrapped - 360 : wrapped);
  })();
  return { text, fontFamily, fontSize, fontWeight, fontStyle, color, rotation };
}

export function hydrateNodes(nodes: KinshipNode[]): KinshipNode[] {
  return nodes.map((node) => {
    if (node.type === KINSHIP_TEXT_NODE_TYPE || isTextNode(node as KinshipNode)) {
      const textNode = node as KinshipTextNode;
      const data = sanitizeTextNodeData(textNode.data);
      const width = textNode.width ?? TEXT_NODE_INITIAL_WIDTH;
      const height = textNode.height ?? TEXT_NODE_INITIAL_HEIGHT;
      return {
        ...textNode,
        type: KINSHIP_TEXT_NODE_TYPE,
        width,
        height,
        // Keep CSS in sync with the React Flow bounding box so the inner
        // rotation/centering wrapper can use `100%` units.
        style: {
          ...(textNode.style ?? {}),
          width,
          height,
        },
        data,
      } satisfies KinshipTextNode;
    }

    const symbolNode = node as KinshipSymbolNode;
    return {
      ...symbolNode,
      type: KINSHIP_NODE_TYPE,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      // Always normalize to the current NODE_WIDTH/NODE_HEIGHT so charts
      // saved with a previous (larger) wrapper size adopt the latest
      // dimensions on reload — keeps padding/handle positions consistent
      // across versions.
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      style: {
        ...(symbolNode.style ?? {}),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      },
      data: {
        label: symbolNode.data?.label ?? "",
        notes: symbolNode.data?.notes ?? "",
        symbolType: symbolNode.data?.symbolType,
      },
    } satisfies KinshipSymbolNode;
  });
}

export function hydrateEdges(edges: KinshipEdge[]): KinshipEdge[] {
  return edges
    .filter((edge) => {
      const rawType = (edge.data?.relationshipType ?? edge.type) as string;
      return rawType !== "sibling";
    })
    .map((edge) => {
      const relationshipType =
        edge.data?.relationshipType ??
        (KINSHIP_RELATIONSHIP_TYPES.includes(
          edge.type as KinshipRelationshipType,
        )
          ? (edge.type as KinshipRelationshipType)
          : "descended-from");

      return {
        ...edge,
        type: relationshipType,
        data: {
          relationshipType,
          label: edge.data?.label ?? "",
        },
      };
    });
}

export function buildChartDocumentSnapshot({
  title,
  createdAt,
  viewport,
  nodes,
  edges,
}: {
  title: string;
  createdAt: string;
  viewport: ChartViewport;
  nodes: KinshipNode[];
  edges: KinshipEdge[];
}): ChartDocument {
  return {
    version: 1,
    meta: {
      title: normaliseTitle(title),
      createdAt,
      updatedAt: nowIso(),
    },
    viewport,
    nodes: hydrateNodes(nodes),
    edges: hydrateEdges(edges),
  };
}

export function createEmptyChartDocument(title = "Untitled chart"): ChartDocument {
  const stamp = nowIso();
  return {
    version: 1,
    meta: {
      title: normaliseTitle(title),
      createdAt: stamp,
      updatedAt: stamp,
    },
    viewport: DEFAULT_VIEWPORT,
    nodes: [],
    edges: [],
  };
}

export function createChartRecord(
  title = "Untitled chart",
  document = createEmptyChartDocument(title),
  id = crypto.randomUUID(),
): ChartRecord {
  const chartTitle = normaliseTitle(title || document.meta.title);

  return {
    id,
    title: chartTitle,
    document: {
      ...document,
      meta: {
        ...document.meta,
        title: chartTitle,
      },
    },
    updatedAt: document.meta.updatedAt,
    dirty: true,
    deleted: false,
  };
}

export function createConflictCopy(record: ChartRecord): ChartRecord {
  const copyTitle = `${normaliseTitle(record.title)} Conflict copy`;
  const copyDocument = cloneChartDocument(record.document);

  copyDocument.meta.title = copyTitle;
  copyDocument.meta.updatedAt = nowIso();

  return {
    ...record,
    id: crypto.randomUUID(),
    title: copyTitle,
    document: copyDocument,
    updatedAt: copyDocument.meta.updatedAt,
    dirty: true,
    deleted: false,
    cloudId: undefined,
    lastSyncedAt: undefined,
  };
}
