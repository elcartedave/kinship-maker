import type { Edge, Node, Viewport } from "@xyflow/react";

export const KINSHIP_NODE_TYPE = "kinshipSymbol" as const;
export const KINSHIP_TEXT_NODE_TYPE = "kinshipText" as const;
export const KINSHIP_CLUSTER_NODE_TYPE = "kinshipCluster" as const;

export const KINSHIP_NODE_TYPES = [
  KINSHIP_NODE_TYPE,
  KINSHIP_TEXT_NODE_TYPE,
  KINSHIP_CLUSTER_NODE_TYPE,
] as const;

export const KINSHIP_SYMBOL_TYPES = [
  "female",
  "male",
  "deceased-female",
  "deceased-male",
  "female-ego",
  "male-ego",
  "adopted-female",
  "adopted-male",
] as const;

export const KINSHIP_RELATIONSHIP_TYPES = [
  "married",
  "cohabiting",
  "divorced",
  "separated",
  "fictive",
  "descended-from",
] as const;

export type KinshipSymbolType = (typeof KINSHIP_SYMBOL_TYPES)[number];
export type KinshipRelationshipType =
  (typeof KINSHIP_RELATIONSHIP_TYPES)[number];

export type ChartViewport = Pick<Viewport, "x" | "y" | "zoom">;

/** Data carried by a person/symbol node (pink circle, blue triangle, etc.). */
export type KinshipNodeData = {
  symbolType: KinshipSymbolType;
  label: string;
  notes?: string;
  isCollapsedBranchRoot?: boolean;
};

/**
 * Free-form text annotation node. Lives on the canvas alongside symbol nodes
 * but does not participate in kinship relationships, so it has no handles and
 * is filtered out of label-derivation, ego framing, etc.
 */
export type KinshipTextNodeData = {
  text: string;
  /** CSS font-family stack (one of TEXT_FONT_FAMILIES.value). */
  fontFamily: string;
  /** Pixel font size. */
  fontSize: number;
  /** CSS font-weight (e.g. 400, 600, 700). */
  fontWeight: number;
  /** "normal" | "italic". */
  fontStyle: "normal" | "italic";
  /** CSS color (hex string is canonical). */
  color: string;
  /**
   * Visible rotation in degrees, applied to the text content via CSS
   * `transform: rotate()`. Stored normalized to [-180, 180]; the React Flow
   * bounding box itself stays axis-aligned so dragging and resizing keep
   * working in screen-space.
   */
  rotation?: number;
};

export type KinshipClusterNodeData = {
  label: string;
  count: number;
  surname: string | null;
  rootId: string;
};

export type KinshipEdgeData = {
  relationshipType: KinshipRelationshipType;
  label?: string;
};

export type KinshipSymbolNode = Node<KinshipNodeData, typeof KINSHIP_NODE_TYPE>;
export type KinshipTextNode = Node<
  KinshipTextNodeData,
  typeof KINSHIP_TEXT_NODE_TYPE
>;
export type KinshipClusterNode = Node<
  KinshipClusterNodeData,
  typeof KINSHIP_CLUSTER_NODE_TYPE
>;

/**
 * Union of every node kind that the kinship canvas can hold. Use the
 * {@link isSymbolNode} / {@link isTextNode} guards (in `@/lib/kinship/symbols`)
 * to narrow before reading kind-specific fields like `data.symbolType` or
 * `data.fontFamily`.
 */
export type KinshipNode =
  | KinshipSymbolNode
  | KinshipTextNode
  | KinshipClusterNode;

export type KinshipEdge = Edge<KinshipEdgeData, KinshipRelationshipType>;

export type ChartDocument = {
  version: 1;
  meta: {
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  viewport: ChartViewport;
  nodes: KinshipNode[];
  edges: KinshipEdge[];
};

export type ChartRecord = {
  id: string;
  title: string;
  document: ChartDocument;
  updatedAt: string;
  ownerId?: string;
  ownerLabel?: string;
  memberIds?: string[];
  egoNodeId?: string | null;
  cloudId?: string;
  dirty: boolean;
  deleted: boolean;
  lastSyncedAt?: string;
};

export type RemoteChartRecord = {
  id: string;
  user_id: string;
  title: string;
  document: ChartDocument;
  updated_at: string;
};

export type SyncSummary = {
  pushed: number;
  pulled: number;
  conflicts: number;
  deleted: number;
};
