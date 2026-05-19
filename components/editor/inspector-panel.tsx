"use client";

import { Bold, Italic, Trash2 } from "lucide-react";

import { RelationshipGlyph } from "@/components/editor/relationship-glyph";
import { KinshipSymbolPreview } from "@/components/editor/kinship-symbol-preview";
import { getTextFontFamilyValue } from "@/components/editor/kinship-text-node";
import {
  RELATIONSHIP_TOOLS,
  SYMBOL_LIBRARY,
  TEXT_COLOR_SWATCHES,
  TEXT_FONT_FAMILIES,
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  TEXT_FONT_SIZE_STEP,
} from "@/lib/kinship/constants";
import {
  isSymbolNode,
  isSymbolTypeAllowedForSexAssignedAtBirth,
  isTextNode,
} from "@/lib/kinship/symbols";
import type {
  KinshipEdge,
  KinshipRelationshipType,
  KinshipSymbolType,
  KinshipNode,
  KinshipTextNodeData,
} from "@/lib/kinship/types";

type InspectorPanelProps = {
  cloudStatus: string;
  isNodeCollapsed?: boolean;
  currentTool: KinshipRelationshipType | null;
  inviteFeedback?: string | null;
  invitePending?: boolean;
  canManageLinkedUser?: boolean;
  linkedUserLoading?: boolean;
  linkedUserLabel?: string | null;
  linkedUserFullName?: string | null;
  linkedUserAge?: number | null;
  linkedUserSexAssignedAtBirth?: "female" | "male" | null;
  linkedUserStatus?: "linked" | "pending" | null;
  localStatus: string;
  onDeleteSelection?: () => void;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  onEdgeLabelChange: (value: string) => void;
  onEdgeTypeChange: (value: KinshipRelationshipType) => void;
  onNodeLabelChange: (value: string) => void;
  onNodeNotesChange: (value: string) => void;
  onNodeSymbolTypeChange: (value: KinshipSymbolType) => void;
  onNodeUserInvite?: (email: string) => void;
  onNodeUserUnlink?: () => void;
  /** Patch the selected text node's data. */
  onTextNodeChange: (patch: Partial<KinshipTextNodeData>) => void;
  selectedEdge: KinshipEdge | null;
  selectedNodeDerivedLabel?: {
    abbreviation: string;
    description: string;
  } | null;
  selectedNode: KinshipNode | null;
};

export function InspectorPanel(props: InspectorPanelProps) {
  const edge = props.selectedEdge;
  const node = props.selectedNode;
  const symbolNode = node && isSymbolNode(node) ? node : null;
  const textNode = node && isTextNode(node) ? node : null;

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-strong">
            Inspector
          </p>
          <h2 className="font-display mt-2 text-lg text-ink">
            {symbolNode
              ? "Selected symbol"
              : textNode
                ? "Selected text"
                : edge
                  ? "Selected relationship"
                  : "Details"}
          </h2>
        </div>
        {props.onClose ? (
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3.5">
        {symbolNode ? (
          <>
            <div className="flex items-center gap-3 rounded-[1.2rem] border border-line bg-white/75 px-3 py-3">
              <KinshipSymbolPreview
                symbolType={symbolNode.data.symbolType}
                size={44}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                  Active symbol
                </p>
                <p className="text-sm text-ink-soft">
                  Choose the symbol shape and the visible label.
                </p>
              </div>
            </div>

            {props.onToggleCollapse && (
              <div className="rounded-[1.25rem] border border-line bg-white/75 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                  Branch visibility
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Collapse partners and descendants to simplify the view.
                </p>
                <button
                  type="button"
                  onClick={props.onToggleCollapse}
                  className="mt-3 w-full rounded-full border border-line bg-white px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-ink transition hover:border-accent"
                >
                  {props.isNodeCollapsed
                    ? "Expand descendants"
                    : "Collapse descendants"}
                </button>
              </div>
            )}

            <DeleteRow
              label="Delete symbol"
              onDelete={props.onDeleteSelection}
            />

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
                Symbol type
              </span>
              <select
                value={symbolNode.data.symbolType}
                onChange={(event) =>
                  props.onNodeSymbolTypeChange(
                    event.target.value as KinshipSymbolType,
                  )
                }
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              >
                {SYMBOL_LIBRARY.map((symbol) => {
                  const allowed =
                    !props.linkedUserSexAssignedAtBirth ||
                    isSymbolTypeAllowedForSexAssignedAtBirth(
                      symbol.type,
                      props.linkedUserSexAssignedAtBirth,
                    );
                  return (
                    <option
                      key={symbol.type}
                      value={symbol.type}
                      disabled={!allowed}
                    >
                      {symbol.name}
                    </option>
                  );
                })}
              </select>
              {props.linkedUserSexAssignedAtBirth ? (
                <p className="mt-2 text-xs leading-5 text-ink-soft">
                  This node is linked to an account. Only{" "}
                  {props.linkedUserSexAssignedAtBirth === "male"
                    ? "male"
                    : "female"}{" "}
                  symbol variants (including adopted, deceased, and ego) can be
                  selected.
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
                {props.selectedNodeDerivedLabel
                  ? "Derived label"
                  : "Visible label"}
              </span>
              <input
                value={
                  props.selectedNodeDerivedLabel?.abbreviation ??
                  symbolNode.data.label
                }
                onChange={(event) =>
                  props.onNodeLabelChange(event.target.value)
                }
                readOnly={Boolean(props.selectedNodeDerivedLabel)}
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent read-only:cursor-default read-only:border-dashed read-only:bg-white/80"
              />
            </label>

            {props.selectedNodeDerivedLabel ? (
              <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50/90 p-3 text-sm leading-6 text-emerald-950/80">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900">
                  Auto-derived from Ego
                </p>
                <p className="mt-1 font-semibold text-emerald-950">
                  {props.selectedNodeDerivedLabel.abbreviation}
                </p>
                <p className="mt-1">
                  {props.selectedNodeDerivedLabel.description}
                </p>
              </div>
            ) : (
              <p className="text-xs leading-5 text-ink-soft">
                This stays editable until the node becomes part of the active
                Ego family network.
              </p>
            )}

            {props.onNodeUserInvite ||
            props.linkedUserLabel ||
            props.linkedUserLoading ? (
              <NodeUserInvite
                feedback={props.inviteFeedback}
                canManage={props.canManageLinkedUser}
                linkedUserLabel={props.linkedUserLabel}
                linkedUserFullName={props.linkedUserFullName}
                linkedUserAge={props.linkedUserAge}
                loading={props.linkedUserLoading}
                onUnlink={props.onNodeUserUnlink}
                pending={props.invitePending}
                onInvite={props.onNodeUserInvite}
              />
            ) : null}
          </>
        ) : null}

        {textNode ? (
          <TextInspector
            data={textNode.data}
            onChange={props.onTextNodeChange}
            onDelete={props.onDeleteSelection}
          />
        ) : null}

        {edge ? (
          <>
            <div className="flex items-center gap-3 rounded-[1.2rem] border border-line bg-white/75 px-3 py-3">
              <RelationshipGlyph
                relationshipType={
                  edge.data?.relationshipType ?? "descended-from"
                }
                className="h-11 w-11"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                  Active relationship
                </p>
                <p className="text-sm text-ink-soft">
                  Fine-tune the connector after it is placed on the canvas.
                </p>
              </div>
            </div>

            <DeleteRow
              label="Delete relationship"
              onDelete={props.onDeleteSelection}
            />

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
                Relationship type
              </span>
              <select
                value={edge.data?.relationshipType ?? "descended-from"}
                onChange={(event) =>
                  props.onEdgeTypeChange(
                    event.target.value as KinshipRelationshipType,
                  )
                }
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              >
                {RELATIONSHIP_TOOLS.map((relationship) => (
                  <option key={relationship.type} value={relationship.type}>
                    {relationship.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
                Optional label
              </span>
              <input
                value={edge.data?.label ?? ""}
                onChange={(event) =>
                  props.onEdgeLabelChange(event.target.value)
                }
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              />
            </label>
          </>
        ) : null}

        {!node && !edge ? (
          <p className="rounded-[1.25rem] border border-dashed border-line bg-white/65 px-3 py-2.5 text-sm text-ink-soft">
            Nothing selected.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function NodeUserInvite({
  canManage,
  feedback,
  linkedUserLabel,
  linkedUserFullName,
  linkedUserAge,
  linkedUserStatus,
  loading,
  onUnlink,
  pending,
  onInvite,
}: {
  canManage?: boolean;
  feedback?: string | null;
  linkedUserLabel?: string | null;
  linkedUserFullName?: string | null;
  linkedUserAge?: number | null;
  linkedUserStatus?: "linked" | "pending" | null;
  loading?: boolean;
  onUnlink?: () => void;
  pending?: boolean;
  onInvite?: (email: string) => void;
}) {
  return (
    <form
      className="rounded-[1.25rem] border border-line bg-white/65 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const email = String(formData.get("email") ?? "").trim();
        if (!email || !onInvite) {
          return;
        }
        onInvite(email);
        form.reset();
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
        Linked account
      </p>
      {loading && !linkedUserLabel ? (
        <p className="mt-2 text-xs leading-5 text-ink-soft">
          Loading linked account...
        </p>
      ) : linkedUserLabel ? (
        <div className="mt-2 space-y-3">
          <div>
            {linkedUserStatus === "pending" ? (
              <>
                <p className="text-sm leading-6 text-ink-soft">
                  Pending invitation sent to <strong>{linkedUserLabel}</strong>.
                </p>
                {linkedUserFullName ? (
                  <span className="block text-xs font-medium text-ink-soft/80 mt-1">
                    {linkedUserFullName}
                    {linkedUserAge != null ? ` • ${linkedUserAge} y/o` : ""}
                  </span>
                ) : linkedUserAge != null ? (
                  <span className="block text-xs font-medium text-ink-soft/80 mt-1">
                    {linkedUserAge} y/o
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-ink-soft">
                  This node is linked to <strong>{linkedUserLabel}</strong>.
                </p>
                {linkedUserFullName ? (
                  <span className="block text-xs font-medium text-ink-soft/80 mt-1">
                    {linkedUserFullName}
                    {linkedUserAge != null ? ` • ${linkedUserAge} y/o` : ""}
                  </span>
                ) : linkedUserAge != null ? (
                  <span className="block text-xs font-medium text-ink-soft/80 mt-1">
                    {linkedUserAge} y/o
                  </span>
                ) : null}
              </>
            )}
          </div>
          {linkedUserStatus === "pending" ? (
            <p className="rounded-[1rem] border border-dashed border-line bg-white/70 px-3 py-2 text-xs leading-5 text-ink-soft">
              You can’t send another invite until this one is approved,
              rejected, or cancelled.
            </p>
          ) : canManage && onUnlink ? (
            <button
              type="button"
              onClick={onUnlink}
              disabled={pending}
              className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent/40 disabled:cursor-wait disabled:opacity-70"
            >
              Remove linked account
            </button>
          ) : null}
        </div>
      ) : onInvite && linkedUserStatus !== "pending" ? (
        <>
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            Search by email to invite a real app user to approve this node as
            themselves.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              name="email"
              type="email"
              placeholder="person@example.com"
              className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink outline-none transition focus:border-accent"
              required
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full border border-ink bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-white hover:text-ink disabled:cursor-wait disabled:opacity-70"
            >
              Invite
            </button>
          </div>
        </>
      ) : linkedUserStatus === "pending" ? (
        <p className="mt-2 text-xs leading-5 text-ink-soft">
          This invitation is already pending.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-ink-soft">
          No account is linked to this node.
        </p>
      )}
      {feedback ? (
        <p className="mt-2 text-xs leading-5 text-ink-soft">{feedback}</p>
      ) : null}
    </form>
  );
}

function TextInspector({
  data,
  onChange,
  onDelete,
}: {
  data: KinshipTextNodeData;
  onChange: (patch: Partial<KinshipTextNodeData>) => void;
  onDelete?: () => void;
}) {
  const previewStyle = {
    fontFamily: getTextFontFamilyValue(data.fontFamily),
    fontWeight: data.fontWeight,
    fontStyle: data.fontStyle,
    color: data.color,
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-[1.2rem] border border-line bg-white/75 px-3 py-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white"
          style={previewStyle}
        >
          <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>Aa</span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
            Active text
          </p>
          <p className="text-sm text-ink-soft">
            Edit the wording, font, color, and size.
          </p>
        </div>
      </div>

      <DeleteRow label="Delete text" onDelete={onDelete} />

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Text
        </span>
        <textarea
          value={data.text}
          onChange={(event) => onChange({ text: event.target.value })}
          rows={3}
          className="mt-2 w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
          placeholder="Type your annotation…"
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Font
        </span>
        <select
          value={data.fontFamily}
          onChange={(event) => onChange({ fontFamily: event.target.value })}
          className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
        >
          {TEXT_FONT_FAMILIES.map((font) => (
            <option
              key={font.id}
              value={font.id}
              style={{ fontFamily: font.value }}
            >
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Size
          </span>
          <span className="text-xs text-ink-soft tabular-nums">
            {data.fontSize}px
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="range"
            min={TEXT_FONT_SIZE_MIN}
            max={TEXT_FONT_SIZE_MAX}
            step={TEXT_FONT_SIZE_STEP}
            value={data.fontSize}
            onChange={(event) =>
              onChange({ fontSize: Number(event.target.value) })
            }
            className="h-2 flex-1 cursor-pointer accent-[rgb(127,59,12)]"
            aria-label="Font size"
          />
          <input
            type="number"
            min={TEXT_FONT_SIZE_MIN}
            max={TEXT_FONT_SIZE_MAX}
            step={TEXT_FONT_SIZE_STEP}
            value={data.fontSize}
            onChange={(event) =>
              onChange({
                fontSize: clamp(
                  Number(event.target.value),
                  TEXT_FONT_SIZE_MIN,
                  TEXT_FONT_SIZE_MAX,
                ),
              })
            }
            className="w-16 rounded-xl border border-line bg-white px-2 py-2 text-center text-sm text-ink outline-none focus:border-accent"
            aria-label="Font size in pixels"
          />
        </div>
      </div>

      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Color
        </span>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            value={data.color}
            onChange={(event) => onChange({ color: event.target.value })}
            className="h-10 w-12 cursor-pointer rounded-xl border border-line bg-white"
            aria-label="Pick text color"
          />
          <input
            type="text"
            value={data.color}
            onChange={(event) => onChange({ color: event.target.value })}
            className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm font-mono text-ink outline-none focus:border-accent"
            aria-label="Hex color"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TEXT_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange({ color: swatch })}
              title={swatch}
              aria-label={`Use ${swatch}`}
              data-active={data.color.toLowerCase() === swatch.toLowerCase()}
              className="h-6 w-6 rounded-full border border-line transition hover:scale-110 data-[active=true]:ring-2 data-[active=true]:ring-accent-strong"
              style={{ background: swatch }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={data.fontWeight >= 700}
          onClick={() =>
            onChange({ fontWeight: data.fontWeight >= 700 ? 400 : 700 })
          }
          className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink transition aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent-strong"
        >
          <Bold strokeWidth={2.4} className="h-3.5 w-3.5" /> Bold
        </button>
        <button
          type="button"
          aria-pressed={data.fontStyle === "italic"}
          onClick={() =>
            onChange({
              fontStyle: data.fontStyle === "italic" ? "normal" : "italic",
            })
          }
          className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink transition aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent-strong"
        >
          <Italic strokeWidth={2.4} className="h-3.5 w-3.5" /> Italic
        </button>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Rotation
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-soft tabular-nums">
              {Math.round(data.rotation ?? 0)}°
            </span>
            <button
              type="button"
              onClick={() => onChange({ rotation: 0 })}
              className="text-[11px] font-medium text-accent-strong hover:underline"
              aria-label="Reset rotation to 0"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={data.rotation ?? 0}
            onChange={(event) =>
              onChange({ rotation: Number(event.target.value) })
            }
            className="h-2 flex-1 cursor-pointer accent-[rgb(127,59,12)]"
            aria-label="Rotation in degrees"
          />
          <input
            type="number"
            min={-180}
            max={180}
            step={1}
            value={Math.round(data.rotation ?? 0)}
            onChange={(event) =>
              onChange({
                rotation: clamp(Number(event.target.value), -180, 180),
              })
            }
            className="w-16 rounded-xl border border-line bg-white px-2 py-2 text-center text-sm text-ink outline-none focus:border-accent"
            aria-label="Rotation in degrees"
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-ink-soft">
          Tip: drag the round handle above a selected text on the canvas — hold
          Shift to snap to 15°.
        </p>
      </div>
    </>
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Compact, top-of-inspector delete control. Sits right under the "Active <kind>"
 * card so the destructive action is easy to find without scrolling. Styled as
 * an amber-tinted pill — visually distinct (it's the only red-leaning control
 * in the inspector) but not so loud that the eye is dragged away from the
 * primary editing fields below it.
 */
function DeleteRow({
  label,
  onDelete,
}: {
  label: string;
  onDelete?: () => void;
}) {
  if (!onDelete) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 rounded-full px-1.5 py-1.5 pl-3">
      <button
        type="button"
        onClick={onDelete}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-[rgb(153,53,36)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[rgb(125,39,25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <Trash2 strokeWidth={2.4} className="h-3.5 w-3.5" />
        {label}
      </button>
    </div>
  );
}
