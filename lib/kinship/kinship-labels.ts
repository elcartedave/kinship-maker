import {
  filterSymbolNodes,
  getKinshipGender,
  isEgoSymbolType,
} from "@/lib/kinship/symbols";
import type {
  KinshipEdge,
  KinshipNode,
  KinshipRelationshipType,
  KinshipSymbolNode,
} from "@/lib/kinship/types";

const PARTNER_RELATIONSHIP_TYPES = new Set<KinshipRelationshipType>([
  "married",
  "cohabiting",
  "divorced",
  "separated",
]);

const TOKEN_TEXT = {
  B: "Brother",
  D: "Daughter",
  F: "Father",
  H: "Husband",
  M: "Mother",
  S: "Son",
  W: "Wife",
  Z: "Sister",
} as const;

const TOKEN_PRIORITY: Record<KinshipToken, number> = {
  M: 0,
  F: 1,
  Z: 2,
  B: 3,
  D: 4,
  S: 5,
  W: 6,
  H: 7,
};

type KinshipToken = keyof typeof TOKEN_TEXT;

type DerivedKinshipPath = {
  nodeId: string;
  tokens: KinshipToken[];
};

type KinshipNeighbor = {
  nodeId: string;
  token: KinshipToken;
};

export type DerivedKinshipLabel = {
  abbreviation: string;
  description: string;
  tokens: KinshipToken[];
};

export type DerivedKinshipLabelsResult = {
  egoId: string | null;
  labelsByNodeId: Record<string, DerivedKinshipLabel>;
};

function addToListMap(map: Map<string, string[]>, key: string, value: string) {
  const current = map.get(key);

  if (!current) {
    map.set(key, [value]);
    return;
  }

  if (!current.includes(value)) {
    current.push(value);
  }
}

function getRelationshipType(edge: KinshipEdge): KinshipRelationshipType {
  return edge.data?.relationshipType ?? edge.type ?? "descended-from";
}

function isPartnerRelationship(type: KinshipRelationshipType) {
  return PARTNER_RELATIONSHIP_TYPES.has(type);
}

function sortIds(values: Iterable<string>) {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function compareTokenPaths(
  leftTokens: KinshipToken[],
  rightTokens: KinshipToken[],
) {
  if (leftTokens.length !== rightTokens.length) {
    return leftTokens.length - rightTokens.length;
  }

  for (let index = 0; index < leftTokens.length; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];

    if (leftToken !== rightToken) {
      return TOKEN_PRIORITY[leftToken] - TOKEN_PRIORITY[rightToken];
    }
  }

  return leftTokens.join("").localeCompare(rightTokens.join(""));
}

function describeKinshipTokens(tokens: KinshipToken[]) {
  if (tokens.length === 0) {
    return "Ego";
  }

  return tokens.map((token) => TOKEN_TEXT[token]).join("'s ");
}

function createDerivedLabel(tokens: KinshipToken[]): DerivedKinshipLabel {
  return {
    abbreviation: tokens.length === 0 ? "Ego" : tokens.join(""),
    description: describeKinshipTokens(tokens),
    tokens,
  };
}

function getParentToken(node: KinshipSymbolNode): KinshipToken {
  return getKinshipGender(node.data.symbolType) === "male" ? "F" : "M";
}

function getChildToken(node: KinshipSymbolNode): KinshipToken {
  return getKinshipGender(node.data.symbolType) === "male" ? "S" : "D";
}

function getSiblingToken(node: KinshipSymbolNode): KinshipToken {
  return getKinshipGender(node.data.symbolType) === "male" ? "B" : "Z";
}

function getPartnerToken(node: KinshipSymbolNode): KinshipToken {
  return getKinshipGender(node.data.symbolType) === "male" ? "H" : "W";
}

function getPrimaryEgoId(nodes: KinshipSymbolNode[], preferredEgoId?: string | null) {
  if (preferredEgoId && nodes.some((node) => node.id === preferredEgoId)) {
    return preferredEgoId;
  }

  return nodes.find((node) => isEgoSymbolType(node.data.symbolType))?.id ?? null;
}

function buildNeighborMap(nodes: KinshipSymbolNode[], edges: KinshipEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const parentIdsByChild = new Map<string, string[]>();
  const childIdsByParent = new Map<string, string[]>();
  const partnerIdsByNode = new Map<string, string[]>();
  const siblingIdsByNode = new Map<string, string[]>();

  for (const edge of edges) {
    const relationshipType = getRelationshipType(edge);

    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      continue;
    }

    if (relationshipType === "descended-from") {
      addToListMap(parentIdsByChild, edge.target, edge.source);
      addToListMap(childIdsByParent, edge.source, edge.target);
      continue;
    }

    if (isPartnerRelationship(relationshipType)) {
      addToListMap(partnerIdsByNode, edge.source, edge.target);
      addToListMap(partnerIdsByNode, edge.target, edge.source);
    }
  }

  for (const childIds of childIdsByParent.values()) {
    const uniqueChildren = sortIds(childIds);

    for (let index = 0; index < uniqueChildren.length; index += 1) {
      for (
        let siblingIndex = index + 1;
        siblingIndex < uniqueChildren.length;
        siblingIndex += 1
      ) {
        const leftChildId = uniqueChildren[index];
        const rightChildId = uniqueChildren[siblingIndex];

        addToListMap(siblingIdsByNode, leftChildId, rightChildId);
        addToListMap(siblingIdsByNode, rightChildId, leftChildId);
      }
    }
  }

  return {
    nodeById,
    childIdsByParent,
    parentIdsByChild,
    partnerIdsByNode,
    siblingIdsByNode,
  };
}

function getNeighbors(
  nodeId: string,
  graph: ReturnType<typeof buildNeighborMap>,
) {
  const neighbors: KinshipNeighbor[] = [];

  for (const parentId of sortIds(graph.parentIdsByChild.get(nodeId) ?? [])) {
    const parent = graph.nodeById.get(parentId);

    if (parent) {
      neighbors.push({ nodeId: parentId, token: getParentToken(parent) });
    }
  }

  for (const siblingId of sortIds(graph.siblingIdsByNode.get(nodeId) ?? [])) {
    const sibling = graph.nodeById.get(siblingId);

    if (sibling) {
      neighbors.push({ nodeId: siblingId, token: getSiblingToken(sibling) });
    }
  }

  for (const childId of sortIds(graph.childIdsByParent.get(nodeId) ?? [])) {
    const child = graph.nodeById.get(childId);

    if (child) {
      neighbors.push({ nodeId: childId, token: getChildToken(child) });
    }
  }

  for (const partnerId of sortIds(graph.partnerIdsByNode.get(nodeId) ?? [])) {
    const partner = graph.nodeById.get(partnerId);

    if (partner) {
      neighbors.push({ nodeId: partnerId, token: getPartnerToken(partner) });
    }
  }

  return neighbors.sort((left, right) => {
    if (left.token !== right.token) {
      return TOKEN_PRIORITY[left.token] - TOKEN_PRIORITY[right.token];
    }

    return left.nodeId.localeCompare(right.nodeId);
  });
}

export function deriveKinshipLabels(
  nodes: KinshipNode[],
  edges: KinshipEdge[],
  preferredEgoId?: string | null,
): DerivedKinshipLabelsResult {
  // Text annotation nodes have no kinship semantics — exclude them from the
  // graph so they don't show up as siblings/partners of nearby people.
  const symbolNodes = filterSymbolNodes(nodes);
  const egoId = getPrimaryEgoId(symbolNodes, preferredEgoId);

  if (!egoId) {
    return {
      egoId: null,
      labelsByNodeId: {},
    };
  }

  const graph = buildNeighborMap(symbolNodes, edges);
  const labelsByNodeId: Record<string, DerivedKinshipLabel> = {
    [egoId]: createDerivedLabel([]),
  };
  const bestPaths = new Map<string, KinshipToken[]>([[egoId, []]]);
  const queue: DerivedKinshipPath[] = [{ nodeId: egoId, tokens: [] }];

  for (let index = 0; index < queue.length; index += 1) {
    const currentPath = queue[index];

    for (const neighbor of getNeighbors(currentPath.nodeId, graph)) {
      const nextTokens = [...currentPath.tokens, neighbor.token];
      const existingPath = bestPaths.get(neighbor.nodeId);

      if (
        existingPath &&
        compareTokenPaths(nextTokens, existingPath) >= 0
      ) {
        continue;
      }

      bestPaths.set(neighbor.nodeId, nextTokens);
      labelsByNodeId[neighbor.nodeId] = createDerivedLabel(nextTokens);
      queue.push({
        nodeId: neighbor.nodeId,
        tokens: nextTokens,
      });
    }
  }

  return {
    egoId,
    labelsByNodeId,
  };
}

export function getDisplayNodeLabel(
  node: KinshipSymbolNode,
  labelsByNodeId: Record<string, DerivedKinshipLabel>,
) {
  return labelsByNodeId[node.id]?.abbreviation ?? node.data.label;
}
