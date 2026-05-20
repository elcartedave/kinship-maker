"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  getNodesBounds,
  getViewportForBounds,
} from "@xyflow/react";

import { KinshipEditorProvider } from "@/components/editor/kinship-editor-context";
import { KinshipClusterNode } from "@/components/editor/kinship-cluster-node";
import { KinshipSymbolPreview } from "@/components/editor/kinship-symbol-preview";
import { KinshipNode as KinshipNodeComponent } from "@/components/editor/kinship-node";
import {
  KinshipTextNode as KinshipTextNodeComponent,
  getTextFontFamilyValue,
} from "@/components/editor/kinship-text-node";
import { RelationshipEdge } from "@/components/editor/relationship-edge";
import { hydrateEdges, hydrateNodes } from "@/lib/kinship/document";
import { buildRelationshipPaths } from "@/lib/kinship/relationship-paths";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  TEXT_NODE_INITIAL_HEIGHT,
  TEXT_NODE_INITIAL_WIDTH,
} from "@/lib/kinship/constants";
import { isSymbolNode, isTextNode } from "@/lib/kinship/symbols";
import type {
  ChartDocument,
  KinshipNode,
  KinshipRelationshipType,
  KinshipSymbolType,
  KinshipTextNodeData,
} from "@/lib/kinship/types";

const GRID_PREVIEW_SIZE = { width: 240, height: 100 };
const LIST_PREVIEW_SIZE = { width: 160, height: 64 };

const nodeTypes = {
  kinshipSymbol: KinshipNodeComponent,
  kinshipText: KinshipTextNodeComponent,
  kinshipCluster: KinshipClusterNode,
};

const edgeTypes = {
  married: RelationshipEdge,
  cohabiting: RelationshipEdge,
  divorced: RelationshipEdge,
  separated: RelationshipEdge,
  fictive: RelationshipEdge,
  "descended-from": RelationshipEdge,
};

function getPreviewNodeSize(node: KinshipNode) {
  if (isTextNode(node)) {
    return {
      width: node.width ?? TEXT_NODE_INITIAL_WIDTH,
      height: node.height ?? TEXT_NODE_INITIAL_HEIGHT,
    };
  }

  return {
    width: node.width ?? NODE_WIDTH,
    height: node.height ?? NODE_HEIGHT,
  };
}

function getConnectionPoints(
  source: KinshipNode,
  target: KinshipNode,
  relationshipType: KinshipRelationshipType,
) {
  const sourceSize = getPreviewNodeSize(source);
  const targetSize = getPreviewNodeSize(target);

  if (relationshipType === "descended-from") {
    return {
      sourceX: source.position.x + sourceSize.width / 2,
      sourceY: source.position.y + sourceSize.height,
      targetX: target.position.x + targetSize.width / 2,
      targetY: target.position.y,
    };
  }

  return {
    sourceX: source.position.x + sourceSize.width,
    sourceY: source.position.y + sourceSize.height / 2,
    targetX: target.position.x,
    targetY: target.position.y + targetSize.height / 2,
  };
}

export function ChartDocumentPreview({
  document,
  compact = false,
}: {
  document: ChartDocument;
  compact?: boolean;
}) {
  const nodes = useMemo(() => hydrateNodes(document.nodes), [document.nodes]);
  const edges = useMemo(() => hydrateEdges(document.edges), [document.edges]);
  const frame = compact ? LIST_PREVIEW_SIZE : GRID_PREVIEW_SIZE;

  const bounds = useMemo(() => {
    if (nodes.length === 0) {
      return null;
    }

    return getNodesBounds(
      nodes.map((node) => {
        const size = getPreviewNodeSize(node);
        return {
          ...node,
          width: size.width,
          height: size.height,
        };
      }),
    );
  }, [nodes]);

  const viewport = useMemo(() => {
    if (!bounds) {
      return { x: 0, y: 0, zoom: 1 };
    }

    return getViewportForBounds(
      bounds,
      frame.width,
      frame.height,
      0.08,
      2,
      0.06,
    );
  }, [bounds, frame.height, frame.width]);

  const nodeLookup = useMemo(
    () => new Map(nodes.map((node) => [node.id, node] as const)),
    [nodes],
  );

  const editorContext = useMemo(
    () => ({
      getNodeLabelState: (_id: string, label: string) => ({
        description: undefined,
        isAutoDerived: false,
        value: label,
      }),
      getNodeSymbolType: (_id: string, symbolType: KinshipSymbolType) =>
        symbolType,
      showConnectionHandles: false,
      updateNodeLabel: () => {},
      updateTextNodeText: () => {},
      updateTextNodeData: () => {},
    }),
    [],
  );

  const fitViewport = useMemo(() => {
    if (!bounds) {
      return { x: 0, y: 0, zoom: 1 };
    }

    return getViewportForBounds(
      bounds,
      frame.width,
      frame.height,
      0.08,
      2,
      0.06,
    );
  }, [bounds, frame.height, frame.width]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-warm bg-cream ${
        compact ? "h-[64px] w-[160px]" : "h-[100px] w-full"
      }`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(132,112,67,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(132,112,67,0.06)_1px,transparent_1px)] bg-[size:18px_18px]" />

      <div className="absolute inset-0 pointer-events-none">
        <KinshipEditorProvider value={editorContext}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={fitViewport}
            minZoom={0.2}
            maxZoom={2.25}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            style={{ width: "100%", height: "100%" }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              color="rgba(128, 118, 103, 0.18)"
              gap={24}
              variant={BackgroundVariant.Lines}
            />
          </ReactFlow>
        </KinshipEditorProvider>
      </div>

      {nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">
          Empty chart
        </div>
      ) : null}
    </div>
  );
}
