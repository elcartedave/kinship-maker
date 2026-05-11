import type { KinshipRelationshipType } from "@/lib/kinship/types";

/** Perpendicular offset (px) used for the two parallel lines of a partner edge. */
export const PARTNER_LINE_OFFSET = 4;

export function getMidpoint(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  return {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  };
}

export function offsetLine(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset: number,
) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;

  return {
    sourceX: sourceX + nx * offset,
    sourceY: sourceY + ny * offset,
    targetX: targetX + nx * offset,
    targetY: targetY + ny * offset,
  };
}

export function createWavyPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset: number,
) {
  const line = offsetLine(sourceX, sourceY, targetX, targetY, offset);
  const dx = line.targetX - line.sourceX;
  const dy = line.targetY - line.sourceY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  // `steps` controls sampling resolution; `waveCount` controls how many oscillations.
  // Keep them separate so we don't accidentally sample only at sine zero-crossings.
  const steps = Math.max(12, Math.round(length / 12));
  const waveCount = Math.max(2, Math.round(length / 70));
  const amplitude = 4;

  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    const wave = Math.sin(progress * Math.PI * 2 * waveCount) * amplitude;

    return {
      x: line.sourceX + dx * progress + nx * wave,
      y: line.sourceY + dy * progress + ny * wave,
    };
  });

  return points.reduce(
    (path, point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `${path} L ${point.x} ${point.y}`,
    "",
  );
}

export function createLineagePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const branchY = sourceY + Math.max(26, Math.min(58, (targetY - sourceY) / 2));
  return `M ${sourceX} ${sourceY} L ${sourceX} ${branchY} L ${targetX} ${branchY} L ${targetX} ${targetY}`;
}

export function buildRelationshipPaths({
  relationshipType,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: {
  relationshipType: KinshipRelationshipType;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}) {
  if (relationshipType === "married" || relationshipType === "divorced") {
    const first = offsetLine(sourceX, sourceY, targetX, targetY, -PARTNER_LINE_OFFSET);
    const second = offsetLine(sourceX, sourceY, targetX, targetY, PARTNER_LINE_OFFSET);

    return [
      `M ${first.sourceX} ${first.sourceY} L ${first.targetX} ${first.targetY}`,
      `M ${second.sourceX} ${second.sourceY} L ${second.targetX} ${second.targetY}`,
    ];
  }

  if (relationshipType === "cohabiting" || relationshipType === "separated") {
    return [
      createWavyPath(sourceX, sourceY, targetX, targetY, -PARTNER_LINE_OFFSET),
      createWavyPath(sourceX, sourceY, targetX, targetY, PARTNER_LINE_OFFSET),
    ];
  }

  if (relationshipType === "fictive") {
    // A single straight line; the dashed effect is applied via stroke-dasharray
    // at render time so we don't need to bake gaps into the path geometry.
    return [`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`];
  }

  return [createLineagePath(sourceX, sourceY, targetX, targetY)];
}

export function getSlashLine(
  x: number,
  y: number,
  dx: number,
  dy: number,
) {
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;

  return {
    startX: x - ux * 10 - nx * 10,
    startY: y - uy * 10 - ny * 10,
    endX: x + ux * 10 + nx * 10,
    endY: y + uy * 10 + ny * 10,
  };
}
