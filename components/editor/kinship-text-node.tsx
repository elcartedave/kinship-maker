"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";

import { useKinshipEditorContext } from "@/components/editor/kinship-editor-context";
import {
  TEXT_FONT_FAMILIES,
  TEXT_NODE_MIN_HEIGHT,
  TEXT_NODE_MIN_WIDTH,
} from "@/lib/kinship/constants";
import type { KinshipTextNode as KinshipTextNodeType } from "@/lib/kinship/types";

export function getTextFontFamilyValue(fontFamilyId: string): string {
  const found = TEXT_FONT_FAMILIES.find((font) => font.id === fontFamilyId);
  return found?.value ?? TEXT_FONT_FAMILIES[0].value;
}

/**
 * Free-form text annotation node — Canva-flavoured. The React Flow wrapper
 * defines an axis-aligned bounding box that the user can:
 *
 *   - drag (anywhere inside the box) to move
 *   - resize via the 8 handles drawn by {@link NodeResizer} when selected;
 *     widening prevents auto-wrap, narrowing pushes content onto more lines
 *   - rotate via the dedicated handle floating above the box; the rotation
 *     is applied as a CSS transform on the text content only, so React Flow
 *     drag/snap math keeps working in screen space
 *   - double-click to edit the text inline
 *
 * Multi-select (shift-click and lasso) is inherited from React Flow because
 * the outer wrapper carries no `nodrag` / `nopan` opt-outs.
 */
export function KinshipTextNode(props: NodeProps<KinshipTextNodeType>) {
  const { updateTextNodeText, updateTextNodeData } = useKinshipEditorContext();
  const { data, selected, id } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // While the rotation handle is being dragged we keep the in-progress
  // angle in local state so we can render a smooth preview without spamming
  // the React Flow store / history stack. On pointerup we commit once.
  const [previewRotation, setPreviewRotation] = useState<number | null>(null);
  const rotation = previewRotation ?? data.rotation ?? 0;

  useEffect(() => {
    if (!editing) {
      setDraft(data.text);
    }
  }, [data.text, editing]);

  const enterEditMode = useCallback(() => {
    setDraft(data.text);
    setEditing(true);
  }, [data.text]);

  const commit = useCallback(
    (value: string) => {
      updateTextNodeText(id, value);
      setEditing(false);
    },
    [id, updateTextNodeText],
  );

  useLayoutEffect(() => {
    if (!editing) {
      return;
    }
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const handleRotatePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startingRotation = data.rotation ?? 0;
      // Offset between "raw atan2 angle" and the stored rotation at gesture
      // start — keeps the cursor anchored to the same point on the text
      // instead of snapping to the current radial angle.
      const initialAngle =
        Math.atan2(event.clientY - cy, event.clientX - cx) * (180 / Math.PI) +
        90;
      const offset = startingRotation - initialAngle;

      let lastValue = startingRotation;

      const onMove = (e: PointerEvent) => {
        const raw =
          Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
        const next = raw + offset;
        // Wrap into [-180, 180] for a stable inspector slider mapping.
        const wrapped = ((((next + 180) % 360) + 360) % 360) - 180;
        // Hold Shift to snap to 15° increments — matches Figma / Canva
        // conventions so the gesture feels familiar.
        const snapped = e.shiftKey
          ? Math.round(wrapped / 15) * 15
          : Math.round(wrapped);
        lastValue = snapped;
        setPreviewRotation(snapped);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setPreviewRotation(null);
        if (lastValue !== startingRotation) {
          updateTextNodeData(id, { rotation: lastValue });
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [data.rotation, id, updateTextNodeData],
  );

  const fontStack = getTextFontFamilyValue(data.fontFamily);
  const sharedStyle: CSSProperties = {
    fontFamily: fontStack,
    fontSize: `${data.fontSize}px`,
    fontWeight: data.fontWeight,
    fontStyle: data.fontStyle,
    color: data.color,
    lineHeight: 1.2,
    letterSpacing: "0.01em",
  };

  const wrapperClass = [
    "kinship-text-card",
    selected ? "kinship-text-card--selected" : "",
    editing ? "kinship-text-card--editing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showResizeAndRotate = selected && !editing;

  return (
    <div
      ref={containerRef}
      className={wrapperClass}
      onDoubleClick={(event) => {
        event.stopPropagation();
        enterEditMode();
      }}
    >
      <NodeResizer
        nodeId={id}
        isVisible={showResizeAndRotate}
        minWidth={TEXT_NODE_MIN_WIDTH}
        minHeight={TEXT_NODE_MIN_HEIGHT}
        keepAspectRatio={false}
        color="rgba(127, 59, 12, 0.88)"
        handleClassName="kinship-text-resizer-handle"
        lineClassName="kinship-text-resizer-line"
        handleStyle={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: "1.5px solid white",
          background: "rgba(127, 59, 12, 0.92)",
        }}
        lineStyle={{ borderColor: "rgba(127, 59, 12, 0.55)" }}
      />

      <div
        className="kinship-text-card__rotor"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="kinship-text-card__textarea nodrag nopan"
            style={sharedStyle}
            value={draft}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(data.text);
                setEditing(false);
                return;
              }
              // Cmd/Ctrl+Enter or plain Tab commits; plain Enter inserts a
              // newline (multi-line text annotations are useful).
              if (
                (event.key === "Enter" && (event.metaKey || event.ctrlKey)) ||
                event.key === "Tab"
              ) {
                event.preventDefault();
                commit(draft);
              }
            }}
          />
        ) : (
          <div className="kinship-text-card__display" style={sharedStyle}>
            {data.text.length > 0 ? data.text : "Text"}
          </div>
        )}
      </div>

      {showResizeAndRotate ? (
        <div
          className="kinship-text-card__rotation-handle nodrag nopan"
          onPointerDown={handleRotatePointerDown}
          role="slider"
          aria-label="Rotate text"
          aria-valuenow={Math.round(rotation)}
          title="Drag to rotate (hold Shift to snap to 15°)"
        >
          <span
            aria-hidden
            className="kinship-text-card__rotation-handle-stem"
          />
        </div>
      ) : null}
    </div>
  );
}
