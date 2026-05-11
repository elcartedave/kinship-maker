import {
  NODE_HEIGHT,
  NODE_WIDTH,
  SNAP_GRID,
} from "@/lib/kinship/constants";
import { createKinshipEdge, createKinshipNode } from "@/lib/kinship/document";
import { isEgoSymbolType, isSymbolNode } from "@/lib/kinship/symbols";
import type { KinshipIntent } from "@/lib/kinship/ai/schema";
import type { KinshipEdge, KinshipNode, KinshipSymbolNode } from "@/lib/kinship/types";
import { effectiveSex } from "@/lib/kinship/ai/sex-from-role";

const START_X = 40;
const START_Y = 40;
/** Horizontal offset between left edges of a married pair (matches sample chart rhythm). */
const PARTNER_DX = 190;
/** Horizontal gap between sibling / child columns. */
const CHILD_UNIT_GAP = 200;
const ROW_HEIGHT = 200;

function snapCoord(value: number): number {
  const [gx] = SNAP_GRID;
  return Math.round(value / gx) * gx;
}

function personToSymbolType(person: KinshipIntent["people"][number]) {
  const sex = person.sex;
  if (!sex) {
    // The UI panel must call augmentIntentWithLayoutGaps + resolve answers
    // (mergeAnswersAndResolveGaps) before reaching this point. Reaching here
    // means the UI bypassed gap-detection — surface a developer-facing error.
    throw new Error(
      `Layout invariant: missing sex for "${person.id}". The UI should run augmentIntentWithLayoutGaps before calling intentToKinshipGraph.`,
    );
  }
  const dead = person.deceased === true;
  const adopted = person.adopted === true;
  const ego = person.isEgo === true;
  if (ego) {
    return sex === "male" ? "male-ego" : "female-ego";
  }
  if (dead) {
    return sex === "male" ? "deceased-male" : "deceased-female";
  }
  if (adopted) {
    return sex === "male" ? "adopted-male" : "adopted-female";
  }
  return sex === "male" ? "male" : "female";
}

/**
 * Relaxation over partner + parent links until generations stabilize.
 */
function computeGenerations(intent: KinshipIntent): Map<string, number> {
  const gen = new Map<string, number | undefined>();
  const ego = intent.people.find((p) => p.isEgo === true)?.id;
  if (!ego) {
    throw new Error("KinshipIntent must include exactly one isEgo person.");
  }
  gen.set(ego, 0);

  let changed = true;
  let guard = 0;
  while (changed && guard < intent.people.length * 8) {
    guard += 1;
    changed = false;

    for (const pr of intent.partnerRelationships) {
      const ga = gen.get(pr.a);
      const gb = gen.get(pr.b);
      if (ga !== undefined && gb === undefined) {
        gen.set(pr.b, ga);
        changed = true;
      }
      if (gb !== undefined && ga === undefined) {
        gen.set(pr.a, gb);
        changed = true;
      }
    }

    for (const rel of intent.parentRelationships) {
      const childGen = gen.get(rel.child);
      if (childGen !== undefined) {
        const parentGen = childGen - 1;
        for (const p of rel.parents) {
          if (gen.get(p) !== parentGen) {
            gen.set(p, parentGen);
            changed = true;
          }
        }
      }
      const parentGens = rel.parents.map((p) => gen.get(p));
      if (parentGens.every((g) => g !== undefined)) {
        const childGen = Math.max(...(parentGens as number[])) + 1;
        if (gen.get(rel.child) !== childGen) {
          gen.set(rel.child, childGen);
          changed = true;
        }
      }
    }
  }

  for (const p of intent.people) {
    if (gen.get(p.id) === undefined) {
      gen.set(p.id, 0);
    }
  }

  return gen as Map<string, number>;
}

type LayoutUnit =
  | { type: "single"; id: string }
  | { type: "pair"; a: string; b: string };

/**
 * Left / right slot ids for a partner pair on the chart: female (circle) on
 * the left, male (triangle) on the right when sex is known for both. Otherwise
 * stable lexicographic order by id.
 */
export function orderedPartnerIdsForLayout(
  aId: string,
  bId: string,
  peopleById: Map<string, KinshipIntent["people"][number]>,
): [string, string] {
  const pa = peopleById.get(aId);
  const pb = peopleById.get(bId);
  const sa = pa ? effectiveSex(pa) : null;
  const sb = pb ? effectiveSex(pb) : null;

  if (sa === "female" && sb === "male") {
    return [aId, bId];
  }
  if (sa === "male" && sb === "female") {
    return [bId, aId];
  }

  // Same sex or unknown: deterministic id order
  return aId.localeCompare(bId) < 0 ? [aId, bId] : [bId, aId];
}

function buildLayoutUnits(
  intent: KinshipIntent,
  generation: number,
  genMap: Map<string, number>,
): LayoutUnit[] {
  const inRow = new Set(
    intent.people.filter((p) => genMap.get(p.id) === generation).map((p) => p.id),
  );
  if (inRow.size === 0) {
    return [];
  }

  const paired = new Set<string>();
  const units: LayoutUnit[] = [];
  const peopleById = new Map(intent.people.map((p) => [p.id, p]));

  for (const pr of intent.partnerRelationships) {
    if (!inRow.has(pr.a) || !inRow.has(pr.b)) {
      continue;
    }
    if (paired.has(pr.a) || paired.has(pr.b)) {
      continue;
    }
    paired.add(pr.a);
    paired.add(pr.b);
    const [left, right] = orderedPartnerIdsForLayout(pr.a, pr.b, peopleById);
    units.push({ type: "pair", a: left, b: right });
  }

  for (const id of inRow) {
    if (!paired.has(id)) {
      units.push({ type: "single", id });
    }
  }

  const egoId = intent.people.find((p) => p.isEgo)?.id ?? "";
  units.sort((u1, u2) => {
    const key = (u: LayoutUnit) => {
      const ids =
        u.type === "single" ? [u.id] : [u.a, u.b];
      const touchesEgo = ids.includes(egoId);
      return `${touchesEgo ? "0" : "1"}-${ids.join(",")}`;
    };
    return key(u1).localeCompare(key(u2));
  });

  return units;
}

function advanceCursorAfterUnit(cursor: number, unit: LayoutUnit): number {
  if (unit.type === "single") {
    return cursor + NODE_WIDTH + CHILD_UNIT_GAP;
  }
  return cursor + PARTNER_DX + NODE_WIDTH + CHILD_UNIT_GAP;
}

/**
 * Turn a validated, fully-specified {@link KinshipIntent} into symbol nodes and
 * edges suitable for React Flow (before {@link hydrateNodes}).
 */
export function intentToKinshipGraph(intent: KinshipIntent): {
  nodes: KinshipSymbolNode[];
  edges: KinshipEdge[];
} {
  if (intent.clarifications.length > 0) {
    throw new Error(
      "Cannot convert intent with pending clarifications; resolve them in the UI first.",
    );
  }

  const genMap = computeGenerations(intent);
  const generations = [...new Set(intent.people.map((p) => genMap.get(p.id) ?? 0))];
  const minGen = Math.min(...generations);
  const maxGen = Math.max(...generations);

  const positions = new Map<string, { x: number; y: number }>();

  for (let g = minGen; g <= maxGen; g += 1) {
    const y = snapCoord(START_Y + (g - minGen) * ROW_HEIGHT);
    const units = buildLayoutUnits(intent, g, genMap);
    let cursor = START_X;
    for (const unit of units) {
      if (unit.type === "single") {
        positions.set(unit.id, { x: snapCoord(cursor), y });
        cursor = advanceCursorAfterUnit(cursor, unit);
      } else {
        positions.set(unit.a, { x: snapCoord(cursor), y });
        positions.set(unit.b, {
          x: snapCoord(cursor + PARTNER_DX),
          y,
        });
        cursor = advanceCursorAfterUnit(cursor, unit);
      }
    }
  }

  const nodes: KinshipSymbolNode[] = intent.people.map((p) => {
    const pos = positions.get(p.id);
    if (!pos) {
      throw new Error(`Internal layout error: missing position for ${p.id}`);
    }
    return createKinshipNode({
      id: p.id,
      symbolType: personToSymbolType(p),
      label: p.displayName ?? "",
      x: pos.x,
      y: pos.y,
    });
  });

  const edges: KinshipEdge[] = [];
  let edgeSeq = 0;
  const nextEdgeId = () => {
    edgeSeq += 1;
    return `ai-edge-${edgeSeq}`;
  };

  for (const pr of intent.partnerRelationships) {
    const pa = positions.get(pr.a);
    const pb = positions.get(pr.b);
    if (!pa || !pb) {
      continue;
    }
    const [leftId, rightId] =
      pa.x <= pb.x ? [pr.a, pr.b] : [pr.b, pr.a];
    edges.push(
      createKinshipEdge({
        id: nextEdgeId(),
        source: leftId,
        sourceHandle: "right",
        target: rightId,
        targetHandle: "left",
        relationshipType: pr.status,
      }),
    );
  }

  for (const rel of intent.parentRelationships) {
    for (const parentId of rel.parents) {
      edges.push(
        createKinshipEdge({
          id: nextEdgeId(),
          source: parentId,
          sourceHandle: "bottom",
          target: rel.child,
          targetHandle: "top",
          relationshipType: "descended-from",
        }),
      );
    }
  }

  return { nodes, edges };
}

const MERGE_GAP_PX = 400;

/**
 * Offset for merging a freshly generated subgraph into an existing chart:
 * place it to the right of the rightmost symbol node, vertically aligned with
 * the topmost symbol row.
 */
export function computeSubgraphMergeOffset(
  existingNodes: KinshipNode[],
  subgraphNodes: KinshipSymbolNode[],
): { dx: number; dy: number } {
  if (subgraphNodes.length === 0) {
    return { dx: 0, dy: 0 };
  }

  const symbols = existingNodes.filter(isSymbolNode);
  const minNy = Math.min(...subgraphNodes.map((n) => n.position.y));

  if (symbols.length === 0) {
    return { dx: 0, dy: snapCoord(-minNy + START_Y) };
  }

  let maxX = -Infinity;
  let minY = Infinity;
  for (const n of symbols) {
    const w = n.width ?? NODE_WIDTH;
    const h = n.height ?? NODE_HEIGHT;
    maxX = Math.max(maxX, n.position.x + w);
    minY = Math.min(minY, n.position.y);
  }

  let minNx = Infinity;
  for (const n of subgraphNodes) {
    minNx = Math.min(minNx, n.position.x);
  }

  const rawDx = maxX + MERGE_GAP_PX - minNx;
  const rawDy = minY - minNy;
  return { dx: snapCoord(rawDx), dy: snapCoord(rawDy) };
}

export function translateSymbolNodes(
  nodes: KinshipSymbolNode[],
  dx: number,
  dy: number,
): KinshipSymbolNode[] {
  return nodes.map((n) => ({
    ...n,
    position: {
      x: snapCoord(n.position.x + dx),
      y: snapCoord(n.position.y + dy),
    },
  }));
}

/**
 * Replace all node/edge ids with fresh UUIDs so merged content never collides
 * with existing chart ids.
 */
export function remapKinshipIds(
  nodes: KinshipSymbolNode[],
  edges: KinshipEdge[],
): { nodes: KinshipSymbolNode[]; edges: KinshipEdge[] } {
  const idMap = new Map<string, string>();
  for (const n of nodes) {
    idMap.set(n.id, crypto.randomUUID());
  }

  const newNodes: KinshipSymbolNode[] = nodes.map((n) => ({
    ...n,
    id: idMap.get(n.id)!,
  }));

  const newEdges: KinshipEdge[] = edges.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    source: idMap.get(e.source)!,
    target: idMap.get(e.target)!,
  }));

  return { nodes: newNodes, edges: newEdges };
}

/** True if the chart already has an ego symbol (male-ego / female-ego). */
export function chartHasEgoSymbol(nodes: KinshipNode[]): boolean {
  return nodes.some(
    (n) => isSymbolNode(n) && isEgoSymbolType(n.data.symbolType),
  );
}
