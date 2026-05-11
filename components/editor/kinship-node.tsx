"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { NODE_SHAPE_SIZE } from "@/lib/kinship/constants";
import { useKinshipEditorContext } from "@/components/editor/kinship-editor-context";
import { KinshipSymbolPreview } from "@/components/editor/kinship-symbol-preview";
import type { KinshipSymbolNode } from "@/lib/kinship/types";

export function KinshipNode(props: NodeProps<KinshipSymbolNode>) {
  const { getNodeLabelState, showConnectionHandles, updateNodeLabel } =
    useKinshipEditorContext();
  const labelState = getNodeLabelState(props.id, props.data.label);
  const handleClassName = showConnectionHandles
    ? undefined
    : "kinship-handle-hidden";

  return (
    <div className="kinship-node-card">
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className={`kinship-handle kinship-handle-lineage ${handleClassName ?? ""}`}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className={`kinship-handle kinship-handle-side ${handleClassName ?? ""}`}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={`kinship-handle kinship-handle-side ${handleClassName ?? ""}`}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className={`kinship-handle kinship-handle-lineage ${handleClassName ?? ""}`}
      />

      <div
        className="flex h-full w-full flex-col items-center justify-center gap-px rounded-[1.4rem] px-2"
        style={{ minHeight: NODE_SHAPE_SIZE }}
      >
        <KinshipSymbolPreview
          symbolType={props.data.symbolType}
          className="block shrink-0 -mb-1.5"
        />
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
