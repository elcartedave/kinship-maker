"use client";

import { createContext, useContext } from "react";

import type { KinshipSymbolType, KinshipTextNodeData } from "@/lib/kinship/types";

type KinshipEditorContextValue = {
  getNodeLabelState: (
    id: string,
    label: string,
  ) => {
    description?: string;
    isAutoDerived: boolean;
    value: string;
  };
  getNodeSymbolType: (id: string, symbolType: KinshipSymbolType) => KinshipSymbolType;
  showConnectionHandles: boolean;
  updateNodeLabel: (id: string, label: string) => void;
  /**
   * Inline edit commit for text annotation nodes. The chart editor wires
   * this to its history/autosave pipeline so undo and persistence work the
   * same way as the inspector's text edits.
   */
  updateTextNodeText: (id: string, text: string) => void;
  /**
   * Patch arbitrary fields on a text node's data (rotation, color, font…)
   * by id. Used by the on-canvas rotation handle so it can update a node
   * without going through the inspector's "currently selected" path.
   */
  updateTextNodeData: (id: string, patch: Partial<KinshipTextNodeData>) => void;
};

const KinshipEditorContext = createContext<KinshipEditorContextValue | null>(
  null,
);

export function KinshipEditorProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: KinshipEditorContextValue;
}) {
  return (
    <KinshipEditorContext.Provider value={value}>
      {children}
    </KinshipEditorContext.Provider>
  );
}

export function useKinshipEditorContext() {
  const context = useContext(KinshipEditorContext);

  if (!context) {
    throw new Error(
      "useKinshipEditorContext must be used inside KinshipEditorProvider",
    );
  }

  return context;
}
