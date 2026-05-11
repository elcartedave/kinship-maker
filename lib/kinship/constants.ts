import type {
  KinshipRelationshipType,
  KinshipSymbolType,
  KinshipTextNodeData,
} from "@/lib/kinship/types";

// Node wrapper size. Kept tight around the 68px symbol + ~14px label so the
// selection outline (which sits on the wrapper edge, where the connection
// handles are) hugs the visible content. Combined with the symbol SVG's
// "8 8 56 56" viewBox — which trims ~14px of empty padding inside the glyph
// itself — the outline-to-symbol gap drops from the previous ~26px (when the
// wrapper was 116×116 with a 0 0 72 72 viewBox) down to ~11–13px.
export const NODE_WIDTH = 80;
export const NODE_HEIGHT = 80;
export const NODE_SHAPE_SIZE = 68;
// Visible background grid is drawn at 24px. We snap at 4px (a divisor of 24
// so nodes still land cleanly on the visible grid when placed there) which
// makes drags feel smooth — small mouse nudges actually move the node — while
// still preserving sub-cell alignment between parents and children.
export const SNAP_GRID: [number, number] = [4, 4];
export const EXPORT_PADDING = 80;
export const AUTOSAVE_DELAY_MS = 700;
/** Comfortable default pan/zoom for placing fixed-size nodes (~116×116, 24px grid). */
export const DEFAULT_VIEWPORT = { x: 200, y: 136, zoom: 1.15 };

/** Tailwind `lg` breakpoint — matches floating symbol palette / inspector visibility. */
export const EDITOR_VIEWPORT_LG_BREAKPOINT_PX = 1024;

/**
 * Horizontal insets (px) from the React Flow pane edges toward the chart “usable”
 * band, approximating `left-3` + `w-52` palette and `right-3` + `w-64` inspector.
 */
export const EDITOR_VIEWPORT_LEFT_INSET_PX = 220;
export const EDITOR_VIEWPORT_RIGHT_INSET_PX = 280;

/** Extra margin when fitting / clamping node bounds inside the pane. */
export const EDITOR_VIEWPORT_EDGE_MARGIN_PX = 24;

/**
 * Shift the ego target horizontally (px) to the right of the usable-region center
 * so framing clears the left palette and reads as “medium right.”
 */
export const EDITOR_VIEWPORT_EGO_BIAS_X_PX = 56;
export const EXPORT_BACKGROUND = "#ffffff";
export const APP_NAME = "Kinship Maker";
export const APP_DESCRIPTION =
  "Build kinship charts with drag-and-drop symbols, offline autosave, and cropped PNG or PDF exports.";

export type SymbolLibraryItem = {
  type: KinshipSymbolType;
  name: string;
  hint: string;
  sampleLabel: string;
};

export type RelationshipTool = {
  type: KinshipRelationshipType;
  name: string;
  hint: string;
  purpose: string;
  handles: string;
};

export const SYMBOL_LIBRARY: SymbolLibraryItem[] = [
  {
    type: "female",
    name: "Female",
    hint: "Pink circle",
    sampleLabel: "F",
  },
  {
    type: "male",
    name: "Male",
    hint: "Blue triangle",
    sampleLabel: "M",
  },
  {
    type: "deceased-female",
    name: "Deceased Female",
    hint: "Circle with slash",
    sampleLabel: "FM",
  },
  {
    type: "deceased-male",
    name: "Deceased Male",
    hint: "Triangle with slash",
    sampleLabel: "FB",
  },
  {
    type: "female-ego",
    name: "Female Ego",
    hint: "Black circle",
    sampleLabel: "Ego",
  },
  {
    type: "male-ego",
    name: "Male Ego",
    hint: "Black triangle",
    sampleLabel: "Ego",
  },
  {
    type: "adopted-female",
    name: "Adopted Female",
    hint: "Circle with inner dot",
    sampleLabel: "AF",
  },
  {
    type: "adopted-male",
    name: "Adopted Male",
    hint: "Triangle with inner dot",
    sampleLabel: "AM",
  },
];

export const RELATIONSHIP_TOOLS: RelationshipTool[] = [
  {
    type: "descended-from",
    name: "Parent / Child",
    hint: "Bottom to top lineage line",
    purpose: "Use this to connect a parent down to a child.",
    handles: "Drag from the parent's bottom handle to the child's top handle.",
  },
  {
    type: "married",
    name: "Married",
    hint: "Side-to-side double line",
    purpose: "Use this between spouses in a marriage relationship.",
    handles: "Drag from one side handle to the other side handle.",
  },
  {
    type: "cohabiting",
    name: "Cohabiting",
    hint: "Side-to-side double wave",
    purpose: "Use this for partners living together without marriage.",
    handles: "Drag from one side handle to the other side handle.",
  },
  {
    type: "divorced",
    name: "Divorced",
    hint: "Double line with slash",
    purpose: "Use this for partners who were married and later divorced.",
    handles: "Drag from one side handle to the other side handle.",
  },
  {
    type: "separated",
    name: "Separated",
    hint: "Double wave with slash",
    purpose: "Use this for partners who are separated but not divorced.",
    handles: "Drag from one side handle to the other side handle.",
  },
  {
    type: "fictive",
    name: "Fictive Kin",
    hint: "Dashed side-to-side line",
    purpose:
      "Use this for chosen-family or non-blood ties (godparents, close family friends, etc.).",
    handles: "Drag from one side handle to the other side handle.",
  },
];

export const PAPER_BACKGROUND = "#f7eed4";
export const PAPER_ACCENT = "#d9c68b";

/* ---------------------------------------------------------------------------
 * Text annotations
 * -------------------------------------------------------------------------*/

export type TextFontFamilyOption = {
  /** Stable id stored in node data. Maps 1:1 to a CSS font-family stack. */
  id: string;
  /** User-facing label shown in the inspector dropdown. */
  label: string;
  /** CSS `font-family` value used when rendering the text node. */
  value: string;
};

/**
 * Curated font stacks. Uses system / generic families so we don't have to
 * load web fonts — the chart still renders if the user is offline. The `id`
 * is what's stored in `KinshipTextNodeData.fontFamily`; when a chart is
 * opened we look the value up here at render time so we can swap stacks
 * later without invalidating saved data.
 */
export const TEXT_FONT_FAMILIES: TextFontFamilyOption[] = [
  {
    id: "display",
    label: "Display",
    value:
      'var(--font-display, "Cormorant Garamond"), "Cormorant Garamond", Georgia, serif',
  },
  {
    id: "serif",
    label: "Serif",
    value: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "sans",
    label: "Sans",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "mono",
    label: "Mono",
    value:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "handwriting",
    label: "Handwriting",
    value:
      '"Bradley Hand", "Comic Sans MS", "Segoe Script", "Apple Chancery", cursive',
  },
];

export const TEXT_FONT_SIZE_MIN = 8;
export const TEXT_FONT_SIZE_MAX = 96;
export const TEXT_FONT_SIZE_STEP = 1;

/** Curated swatches surfaced as quick-pick chips next to the color input. */
export const TEXT_COLOR_SWATCHES = [
  "#1f1b16",
  "#7f3b0c",
  "#2f5d3f",
  "#1d4ed8",
  "#a21caf",
  "#be185d",
  "#9a3412",
  "#525252",
] as const;

export const DEFAULT_TEXT_NODE_DATA: KinshipTextNodeData = {
  text: "Text",
  fontFamily: TEXT_FONT_FAMILIES[0].id,
  fontSize: 18,
  fontWeight: 600,
  fontStyle: "normal",
  color: "#1f1b16",
  rotation: 0,
};

/**
 * Initial wrapper size for a freshly created text node. The wrapper is now a
 * fixed-size, user-resizable box (Canva-style) — wide enough for a short
 * default phrase but narrow enough that the empty "Text" placeholder doesn't
 * look stranded. Drag the side handles to widen the box (which prevents
 * automatic line wrapping) or the corners to grow both axes.
 */
export const TEXT_NODE_INITIAL_WIDTH = 160;
export const TEXT_NODE_INITIAL_HEIGHT = 44;

/**
 * Hard floor for the resize handles. Smaller than the initial size so the
 * user can shrink-fit a short word, but big enough that single-character
 * boxes never collapse to invisibility.
 */
export const TEXT_NODE_MIN_WIDTH = 56;
export const TEXT_NODE_MIN_HEIGHT = 24;
