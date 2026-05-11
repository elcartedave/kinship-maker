"use client";

import { buildRelationshipPaths } from "@/lib/kinship/relationship-paths";
import type { KinshipRelationshipType } from "@/lib/kinship/types";

export function RelationshipGlyph({
  relationshipType,
  className = "",
}: {
  relationshipType: KinshipRelationshipType;
  className?: string;
}) {
  const paths = buildRelationshipPaths({
    relationshipType,
    sourceX: relationshipType === "descended-from" ? 16 : 12,
    sourceY: relationshipType === "descended-from" ? 12 : 20,
    targetX: relationshipType === "descended-from" ? 28 : 44,
    targetY: relationshipType === "descended-from" ? 48 : 20,
  });

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 56"
      className={className}
    >
      {paths.map((path, index) => (
        <path
          key={`${relationshipType}-${index}`}
          d={path}
          fill="none"
          stroke="#2f2413"
          strokeWidth={relationshipType === "descended-from" ? 2.8 : 2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={
            relationshipType === "fictive" ? "5 3" : undefined
          }
        />
      ))}

      {relationshipType === "divorced" || relationshipType === "separated" ? (
        <path
          d="M 22 28 L 34 12"
          fill="none"
          stroke="#2f2413"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
