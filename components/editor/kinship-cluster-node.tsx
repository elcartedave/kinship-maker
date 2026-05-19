import type { NodeProps } from "@xyflow/react";

import type { KinshipClusterNode as KinshipClusterNodeType } from "@/lib/kinship/types";

export function KinshipClusterNode({
  data,
}: NodeProps<KinshipClusterNodeType>) {
  return (
    <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50/90 px-4 py-3 text-center shadow-[0_6px_18px_rgba(127,59,12,0.12)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900/80">
        Collapsed branch
      </p>
      <p className="mt-2 text-sm font-semibold text-amber-950">{data.label}</p>
      <p className="mt-1 text-xs text-amber-900/70">
        {data.count} member{data.count === 1 ? "" : "s"}
      </p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900/60">
        Click to expand
      </p>
    </div>
  );
}
