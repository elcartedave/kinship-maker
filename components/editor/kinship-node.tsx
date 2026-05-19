"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { NODE_SHAPE_SIZE } from "@/lib/kinship/constants";
import { useKinshipEditorContext } from "@/components/editor/kinship-editor-context";
import { KinshipSymbolPreview } from "@/components/editor/kinship-symbol-preview";
import type { KinshipSymbolNode } from "@/lib/kinship/types";

export function KinshipNode(props: NodeProps<KinshipSymbolNode>) {
  const {
    getNodeLabelState,
    getNodeSymbolType,
    showConnectionHandles,
    updateNodeLabel,
  } = useKinshipEditorContext();
  const labelState = getNodeLabelState(props.id, props.data.label);
  const symbolType = getNodeSymbolType(props.id, props.data.symbolType);
  const handleClassName = showConnectionHandles
    ? undefined
    : "kinship-handle-hidden";

  return (
    <div className="kinship-node-card">
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-px rounded-[1.4rem] px-2 relative"
        style={{ minHeight: NODE_SHAPE_SIZE }}
      >
        <div
          className="relative flex items-center justify-center"
          style={{ width: NODE_SHAPE_SIZE, height: NODE_SHAPE_SIZE }}
        >
          <KinshipSymbolPreview
            symbolType={symbolType}
            className="block shrink-0 -mb-1.5"
          />
          {props.data.isCollapsedBranchRoot && (
            <div
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-ink text-white shadow-md ring-2 ring-ink/30"
              title="This branch has hidden descendants"
            >
              <span className="mb-0.5 text-xs font-bold tracking-tight">
                ...
              </span>
            </div>
          )}

          <Handle
            id="top"
            type="target"
            position={Position.Top}
            className={`z-50! kinship-handle kinship-handle-lineage ${handleClassName ?? ""}`}
          />
          <Handle
            id="left"
            type="target"
            position={Position.Left}
            className={`z-50! kinship-handle kinship-handle-side ${handleClassName ?? ""}`}
          />
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            className={`z-50! kinship-handle kinship-handle-side ${handleClassName ?? ""}`}
          />
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            className={`z-50! kinship-handle kinship-handle-lineage ${handleClassName ?? ""}`}
          />
        </div>

        <input
          aria-label={`Label for ${props.data.symbolType}`}
          aria-readonly={labelState.isAutoDerived}
          title={labelState.description}
          readOnly={labelState.isAutoDerived}
          value={labelState.value}
          maxLength={14}
          onChange={(event) => updateNodeLabel(props.id, event.target.value)}
          className="kinship-node-label nodrag nopan mt-px w-full p-0 leading-tight read-only:cursor-default read-only:text-accent-strong"
        />
      </div>
    </div>
  );
}
