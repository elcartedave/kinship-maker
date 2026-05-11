"use client";

import {
  isEgoSymbolType,
  isMaleSymbolType,
} from "@/lib/kinship/symbols";
import type { KinshipSymbolType } from "@/lib/kinship/types";

const EGO_FILL = "#0a0a0a";
const EGO_STROKE = "#050505";

const FEMALE_FILL = "#f472b6";
const FEMALE_STROKE = "#be185d";

const MALE_FILL = "#60a5fa";
const MALE_STROKE = "#1d4ed8";

const SYMBOL_ACCENT = "#141414";

export function KinshipSymbolPreview({
  symbolType,
  size = 68,
  className = "",
}: {
  symbolType: KinshipSymbolType;
  size?: number;
  className?: string;
}) {
  const isTriangle = isMaleSymbolType(symbolType);
  const isEgo = isEgoSymbolType(symbolType);
  const isDeceased = symbolType.includes("deceased");
  const isAdopted = symbolType.includes("adopted");

  const fill =
    isEgo ? EGO_FILL : isTriangle ? MALE_FILL : FEMALE_FILL;
  const stroke =
    isEgo ? EGO_STROKE : isTriangle ? MALE_STROKE : FEMALE_STROKE;

  return (
    <svg
      aria-hidden="true"
      viewBox="8 8 56 56"
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        overflow: "visible",
      }}
    >
      {isTriangle ? (
        <path
          d="M36 10 L60 56 H12 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx="36" cy="36" r="22" fill={fill} stroke={stroke} strokeWidth="3.4" />
      )}

      {isAdopted ? (
        <circle cx="36" cy="36" r="5.5" fill={SYMBOL_ACCENT} />
      ) : null}

      {isDeceased ? (
        <path
          d="M18 54 L56 18"
          fill="none"
          stroke={SYMBOL_ACCENT}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
