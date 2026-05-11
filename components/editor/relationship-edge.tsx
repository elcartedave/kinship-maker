"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  useStore,
  type EdgeProps,
} from "@xyflow/react";

import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/kinship/constants";
import {
  buildRelationshipPaths,
  getMidpoint,
  getSlashLine,
  PARTNER_LINE_OFFSET,
} from "@/lib/kinship/relationship-paths";
import type { KinshipEdge } from "@/lib/kinship/types";

function Slash({
  x,
  y,
  dx,
  dy,
  color,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}) {
  const { startX, startY, endX, endY } = getSlashLine(x, y, dx, dy);

  return (
    <path
      d={`M ${startX} ${startY} L ${endX} ${endY}`}
      fill="none"
      stroke={color}
      strokeWidth="2.75"
      strokeLinecap="round"
    />
  );
}

function isPartnerRelationship(type: string) {
  return (
    type === "married" ||
    type === "cohabiting" ||
    type === "divorced" ||
    type === "separated"
  );
}

export function RelationshipEdge(props: EdgeProps<KinshipEdge>) {
  const allEdges = useStore((state) => state.edges as KinshipEdge[]);
  const nodeLookup = useStore((state) => state.nodeLookup);
  // Subscribe to a string key that summarises every position relevant to
  // this descendant edge's drop geometry: both parents of the target child
  // and every sibling sharing those parents. This is the *only* way the
  // edge can re-render when the OTHER parent (the one that isn't this
  // edge's source) is moved — React Flow's EdgeWrapper memo only re-runs
  // when this edge's own source/target moves, and `state.nodeLookup` is
  // mutated in place so subscribing to it gives no notifications. Returning
  // a primitive string lets Zustand's default `Object.is` equality detect
  // the change and re-render us on every drag tick.
  const relatedNodesKey = useStore((state) => {
    const edges = state.edges as KinshipEdge[];
    const parentIds = new Set<string>();
    for (const edge of edges) {
      const type = edge.data?.relationshipType ?? edge.type;
      if (type === "descended-from" && edge.target === props.target) {
        parentIds.add(edge.source);
      }
    }

    if (parentIds.size === 0) {
      return "";
    }

    const sortedParents = Array.from(parentIds).sort();
    const siblingTargetIds = new Set<string>();
    for (const edge of edges) {
      const type = edge.data?.relationshipType ?? edge.type;
      if (type === "descended-from" && parentIds.has(edge.source)) {
        siblingTargetIds.add(edge.target);
      }
    }

    const ids = [...sortedParents, ...Array.from(siblingTargetIds).sort()];
    return ids
      .map((id) => {
        const node = state.nodeLookup.get(id);
        if (!node) return `${id}:?`;
        const pos = node.internals.positionAbsolute;
        return `${id}:${pos.x},${pos.y}`;
      })
      .join("|");
  });
  // The value isn't read directly — we just need its identity to drive
  // re-renders. Reference it so eslint doesn't strip the call.
  void relatedNodesKey;
  const color = props.selected ? "#7f3b0c" : "#2f2413";
  const midpoint = getMidpoint(
    props.sourceX,
    props.sourceY,
    props.targetX,
    props.targetY,
  );
  const label = props.data?.label?.trim();
  const relationshipType = props.data?.relationshipType ?? props.type ?? "descended-from";
  const paths: string[] = [];

  if (relationshipType === "descended-from") {
    const parentsForTarget = allEdges.filter(
      (edge) =>
        (edge.data?.relationshipType ?? edge.type) === "descended-from" &&
        edge.target === props.target,
    );
    const parentIds = Array.from(
      new Set(parentsForTarget.map((edge) => edge.source)),
    ).sort();
    const partnerEdge =
      parentIds.length === 2
        ? allEdges.find(
            (edge) =>
              isPartnerRelationship(edge.data?.relationshipType ?? edge.type ?? "") &&
              ((edge.source === parentIds[0] && edge.target === parentIds[1]) ||
                (edge.source === parentIds[1] && edge.target === parentIds[0])),
          )
        : undefined;

    if (partnerEdge && parentIds.length === 2) {
      const visibleParentId = parentIds[0];

      if (props.source !== visibleParentId) {
        return null;
      }

      const groupTargetIds = Array.from(
        new Set(
          allEdges
            .filter(
              (edge) =>
                (edge.data?.relationshipType ?? edge.type) === "descended-from",
            )
            .map((edge) => edge.target)
            .filter((targetId) => {
              const groupParents = Array.from(
                new Set(
                  allEdges
                    .filter(
                      (edge) =>
                        (edge.data?.relationshipType ?? edge.type) ===
                          "descended-from" && edge.target === targetId,
                    )
                    .map((edge) => edge.source),
                ),
              ).sort();

              return (
                groupParents.length === 2 &&
                groupParents[0] === parentIds[0] &&
                groupParents[1] === parentIds[1]
              );
            }),
        ),
      );

      const childTargets = groupTargetIds
        .map((targetId) => {
          const child = nodeLookup.get(targetId)?.internals.userNode;

          if (!child) {
            return null;
          }

          return {
            id: targetId,
            x: child.position.x + (child.width ?? NODE_WIDTH) / 2,
            topY: child.position.y,
          };
        })
        .filter((child): child is NonNullable<typeof child> => child !== null)
        .sort((left, right) => left.x - right.x);

      // Anchor the drop to the actual partner-edge endpoints (the right
      // handle of the source partner to the left handle of the target
      // partner) rather than just to the parent centers. This way the drop
      // tracks the relation itself: when either partner is moved (including
      // the non-source one for this descendant edge — which now triggers a
      // re-render via the nodes subscription above), the drop's anchor moves
      // with the partner line and stays attached.
      const partnerSourceNode = nodeLookup.get(partnerEdge.source)?.internals.userNode;
      const partnerTargetNode = nodeLookup.get(partnerEdge.target)?.internals.userNode;

      if (partnerSourceNode && partnerTargetNode && childTargets.length > 0) {
        const sourceWidth = partnerSourceNode.width ?? NODE_WIDTH;
        const sourceHeight = partnerSourceNode.height ?? NODE_HEIGHT;
        const targetHeight = partnerTargetNode.height ?? NODE_HEIGHT;

        // Partner edge runs from source's right handle to target's left handle.
        const partnerSourceX = partnerSourceNode.position.x + sourceWidth;
        const partnerSourceY = partnerSourceNode.position.y + sourceHeight / 2;
        const partnerTargetX = partnerTargetNode.position.x;
        const partnerTargetY = partnerTargetNode.position.y + targetHeight / 2;

        const partnerMidX = (partnerSourceX + partnerTargetX) / 2;
        const partnerMidY = (partnerSourceY + partnerTargetY) / 2;

        // Perpendicular unit vector to the partner line, oriented downward
        // (positive screen Y) so we always land on the lower of the two
        // parallel partner lines, regardless of which partner is source.
        const dx = partnerTargetX - partnerSourceX;
        const dy = partnerTargetY - partnerSourceY;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        let nx = -dy / length;
        let ny = dx / length;
        if (ny < 0) {
          nx = -nx;
          ny = -ny;
        }

        // PARTNER_LINE_OFFSET = line center; +1.1 = half partner stroke (2.2)
        // so the drop emerges from the bottom edge of the lower partner line.
        const lowerLineDistance = PARTNER_LINE_OFFSET + 1.1;
        const dropStartX = partnerMidX + nx * lowerLineDistance;
        const dropStartY = partnerMidY + ny * lowerLineDistance;

        const barY = Math.max(
          dropStartY + 42,
          Math.min(...childTargets.map((child) => child.topY)) - 34,
        );
        const currentChild = childTargets.find((child) => child.id === props.target);
        const primaryChildId = childTargets[0]?.id;

        if (currentChild) {
          if (props.target === primaryChildId) {
            paths.push(`M ${dropStartX} ${dropStartY} L ${dropStartX} ${barY}`);

            if (childTargets.length > 1) {
              paths.push(
                `M ${childTargets[0].x} ${barY} L ${childTargets.at(-1)?.x ?? childTargets[0].x} ${barY}`,
              );
            }
          }

          if (childTargets.length === 1) {
            paths.push(
              `M ${dropStartX} ${barY} L ${currentChild.x} ${barY} L ${currentChild.x} ${props.targetY}`,
            );
          } else {
            paths.push(`M ${currentChild.x} ${barY} L ${currentChild.x} ${props.targetY}`);
          }
        }
      }
    }
  }

  if (paths.length === 0) {
    paths.push(
      ...buildRelationshipPaths({
        relationshipType,
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        targetX: props.targetX,
        targetY: props.targetY,
      }),
    );
  }

  return (
    <>
      {paths.map((path, index) => (
        <BaseEdge
          key={`${props.id}-${index}`}
          id={`${props.id}-${index}`}
          path={path}
          style={{
            stroke: color,
            strokeWidth: relationshipType === "descended-from" ? 2.6 : 2.2,
            // Fictive kin = non-blood/chosen-family ties → dashed stroke.
            strokeDasharray:
              relationshipType === "fictive" ? "6 4" : undefined,
          }}
        />
      ))}

      {relationshipType === "divorced" || relationshipType === "separated" ? (
        <Slash
          x={midpoint.x}
          y={midpoint.y}
          dx={props.targetX - props.sourceX}
          dy={props.targetY - props.sourceY}
          color={color}
        />
      ) : null}

      {label ? (
        <EdgeLabelRenderer>
          <div
            className="rounded-full border border-line bg-white/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink shadow-sm"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${midpoint.x}px, ${midpoint.y}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
