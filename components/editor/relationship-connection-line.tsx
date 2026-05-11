"use client";

import type { ConnectionLineComponentProps } from "@xyflow/react";

import { buildRelationshipPaths } from "@/lib/kinship/relationship-paths";
import type {
  KinshipNode,
  KinshipRelationshipType,
} from "@/lib/kinship/types";

export function RelationshipConnectionLine({
  relationshipType,
  ...props
}: ConnectionLineComponentProps<KinshipNode> & {
  relationshipType: KinshipRelationshipType;
}) {
  const color = props.connectionStatus === "invalid" ? "#c55b45" : "#7f3b0c";
  const paths = buildRelationshipPaths({
    relationshipType,
    sourceX: props.fromX,
    sourceY: props.fromY,
    targetX: props.toX,
    targetY: props.toY,
  });

  return (
    <g>
      {paths.map((path, index) => (
        <path
          key={`${relationshipType}-${index}`}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={relationshipType === "descended-from" ? 2.8 : 2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={
            relationshipType === "fictive" ? "6 4" : undefined
          }
        />
      ))}
    </g>
  );
}
