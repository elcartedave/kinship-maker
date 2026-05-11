import {
  createKinshipNode,
  createKinshipTextNode,
} from "@/lib/kinship/document";
import { isSymbolNode, isTextNode } from "@/lib/kinship/symbols";
import type {
  KinshipEdge,
  KinshipEdgeData,
  KinshipNode,
  KinshipNodeData,
  KinshipRelationshipType,
  KinshipTextNodeData,
} from "@/lib/kinship/types";

/**
 * Patch a single node's `data`. Accepts either a symbol-node patch
 * ({@link KinshipNodeData}) or a text-node patch ({@link KinshipTextNodeData}) —
 * the runtime just spreads the object on top of `node.data`, so the caller is
 * responsible for sending fields that match the node's kind. We keep the
 * union loose here so the editor can call this function from both branches
 * without complex generic plumbing at every callsite.
 *
 * Generic on the array's element type so callers that pass a narrower array
 * (e.g. `KinshipSymbolNode[]` from a unit test) get the same narrow array
 * back, and the existing `node.data.label` access pattern stays type-safe.
 */
export function updateNodeData<T extends KinshipNode>(
  nodes: T[],
  id: string,
  patch: Partial<KinshipNodeData> | Partial<KinshipTextNodeData>,
): T[] {
  return nodes.map((node) => {
    if (node.id !== id) {
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        ...patch,
      },
    } as T;
  });
}

export function updateEdgeData(
  edges: KinshipEdge[],
  id: string,
  patch: Partial<KinshipEdgeData>,
) {
  return edges.map((edge): KinshipEdge =>
    edge.id === id
      ? (() => {
          const relationshipType =
            patch.relationshipType ??
            edge.data?.relationshipType ??
            (edge.type as KinshipRelationshipType) ??
            "descended-from";

          return {
            ...edge,
            type: relationshipType,
            data: {
              ...(edge.data ?? {}),
              relationshipType,
              ...patch,
            },
          };
        })()
      : edge,
  );
}

export function duplicateNode(
  nodes: KinshipNode[],
  id: string,
) {
  const source = nodes.find((node) => node.id === id);

  if (!source) {
    return { nodes, createdId: null as string | null };
  }

  if (isSymbolNode(source)) {
    const copy = createKinshipNode({
      id: crypto.randomUUID(),
      symbolType: source.data.symbolType,
      label: source.data.label ? `${source.data.label} copy` : "",
      notes: source.data.notes,
      x: source.position.x + 48,
      y: source.position.y + 48,
    });
    return { nodes: [...nodes, copy], createdId: copy.id };
  }

  if (isTextNode(source)) {
    const copy = createKinshipTextNode({
      id: crypto.randomUUID(),
      x: source.position.x + 36,
      y: source.position.y + 36,
      data: { ...source.data },
    });
    return { nodes: [...nodes, copy], createdId: copy.id };
  }

  return { nodes, createdId: null as string | null };
}
