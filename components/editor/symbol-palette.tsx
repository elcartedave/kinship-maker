"use client";

import { Type } from "lucide-react";

import { KinshipSymbolPreview } from "@/components/editor/kinship-symbol-preview";
import { RelationshipGlyph } from "@/components/editor/relationship-glyph";
import { RELATIONSHIP_TOOLS, SYMBOL_LIBRARY } from "@/lib/kinship/constants";
import type { KinshipSymbolType, KinshipRelationshipType } from "@/lib/kinship/types";

export const KINSHIP_TEXT_DRAG_MIME = "application/kinship-annotation" as const;
export const KINSHIP_TEXT_DRAG_VALUE = "text" as const;

export function SymbolPalette({
  activeSymbolType,
  className = "",
  onClose,
  onPickSymbol,
  onStartRelationship,
  currentTool,
}: {
  activeSymbolType: KinshipSymbolType | null;
  className?: string;
  onClose?: () => void;
  onPickSymbol: (symbolType: KinshipSymbolType) => void;
  onStartRelationship?: (relationshipType: KinshipRelationshipType) => void;
  currentTool?: KinshipRelationshipType | null;
}) {
  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-strong">
            Library
          </p>
          <h2 className="font-display mt-1 text-base text-ink">Symbols</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {onStartRelationship
          ? RELATIONSHIP_TOOLS.map((tool) => (
              <button
                key={tool.type}
                type="button"
                draggable
                data-active={tool.type === currentTool}
                aria-label={`${tool.name}. ${tool.hint}`}
                title={`${tool.name} — ${tool.hint}`}
                onClick={() => onStartRelationship(tool.type)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "application/kinship-relationship",
                    tool.type,
                  );
                  event.dataTransfer.setData("text/plain", tool.type);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border-2 transition hover:border-accent/60 focus:outline-none focus-visible:border-accent ${
                  tool.type === currentTool
                    ? "border-accent bg-accent/5"
                    : "border-line bg-white/40 hover:bg-white/60"
                }`}
              >
                <RelationshipGlyph relationshipType={tool.type} className="h-8 w-8" />
              </button>
            ))
          : null}
        {SYMBOL_LIBRARY.map((symbol) => (
          <button
            key={symbol.type}
            type="button"
            draggable
            aria-label={symbol.name}
            title={symbol.name}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/kinship-symbol", symbol.type);
              event.dataTransfer.setData("text/plain", symbol.type);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              // Strict drag & drop: clicking a symbol does not arm placement mode.
            }}
            className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border-2 transition hover:border-accent/60 focus:outline-none focus-visible:border-accent ${
              symbol.type === activeSymbolType
                ? "border-accent bg-accent/5"
                : "border-line bg-white/40 hover:bg-white/60"
            }`}
          >
            <KinshipSymbolPreview symbolType={symbol.type} size={40} />
            <span className="sr-only">{symbol.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-strong">
          Annotations
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            draggable
            aria-label="Text annotation. Drag onto the canvas."
            title="Text — drag to add a free-form label or note."
            onDragStart={(event) => {
              event.dataTransfer.setData(
                KINSHIP_TEXT_DRAG_MIME,
                KINSHIP_TEXT_DRAG_VALUE,
              );
              event.dataTransfer.setData("text/plain", KINSHIP_TEXT_DRAG_VALUE);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border-2 border-line bg-white/40 transition hover:border-accent/60 hover:bg-white/60 focus:outline-none focus-visible:border-accent"
          >
            <Type
              strokeWidth={2.4}
              className="h-5 w-5 text-ink"
              aria-hidden
            />
            <span className="sr-only">Text annotation</span>
          </button>
        </div>
      </div>
    </section>
  );
}
