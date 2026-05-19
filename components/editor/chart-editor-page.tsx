"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type ConnectionLineComponentProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

import { AiGeneratePanel } from "@/components/editor/ai-generate-panel";
import { InspectorPanel } from "@/components/editor/inspector-panel";
import { KinshipEditorProvider } from "@/components/editor/kinship-editor-context";
import { KinshipClusterNode } from "@/components/editor/kinship-cluster-node";
import { KinshipNode as KinshipNodeComponent } from "@/components/editor/kinship-node";
import { KinshipTextNode as KinshipTextNodeComponent } from "@/components/editor/kinship-text-node";
import { RelationshipConnectionLine } from "@/components/editor/relationship-connection-line";
import { RelationshipEdge } from "@/components/editor/relationship-edge";
import { IconToolbarButton } from "@/components/editor/editor-toolbar-icons";
import {
  SaveStatusIndicator,
  type SaveStatusState,
} from "@/components/editor/save-status-indicator";
import {
  KINSHIP_TEXT_DRAG_MIME,
  KINSHIP_TEXT_DRAG_VALUE,
  SymbolPalette,
} from "@/components/editor/symbol-palette";
import { useAppShell } from "@/components/providers/app-shell";
import {
  AUTOSAVE_DELAY_MS,
  DEFAULT_VIEWPORT,
  EDITOR_VIEWPORT_LG_BREAKPOINT_PX,
  NODE_HEIGHT,
  NODE_WIDTH,
  RELATIONSHIP_TOOLS,
  SNAP_GRID,
  TEXT_NODE_INITIAL_HEIGHT,
  TEXT_NODE_INITIAL_WIDTH,
} from "@/lib/kinship/constants";
import { createDebouncedAction } from "@/lib/kinship/autosave";
import {
  buildChartDocumentSnapshot,
  createKinshipNode,
  createKinshipTextNode,
  hydrateEdges,
  hydrateNodes,
} from "@/lib/kinship/document";
import {
  computeEgoBiasedViewport,
  sanitizeChartViewport,
} from "@/lib/kinship/editor-viewport";
import {
  duplicateNode,
  updateEdgeData,
  updateNodeData,
} from "@/lib/kinship/editor-state";
import { exportChartAsPdf, exportChartAsPng } from "@/lib/kinship/export";
import { useOnlineStatus } from "@/lib/kinship/use-online-status";
import { deriveKinshipLabels } from "@/lib/kinship/kinship-labels";
import {
  ensureChartRecord,
  getChartRecord,
  remoteChartToLocal,
  saveChartDocument,
  saveChartRecord,
} from "@/lib/kinship/local-store";
import {
  getKinshipGender,
  isEgoSymbolType,
  isMaleSymbolType,
  isSymbolNode,
  isTextNode,
} from "@/lib/kinship/symbols";
import type {
  ChartDocument,
  ChartRecord,
  ChartViewport,
  KinshipEdge,
  KinshipNode,
  KinshipRelationshipType,
  KinshipSymbolType,
  KinshipTextNodeData,
} from "@/lib/kinship/types";
import { KINSHIP_CLUSTER_NODE_TYPE } from "@/lib/kinship/types";
import {
  Hand,
  MousePointer2,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  Maximize2,
  Crosshair,
  ImageDown,
  FileText,
  CloudUpload,
  Undo2,
  Redo2,
  Sparkles,
} from "lucide-react";

type CanvasTool = "hand" | "pointer";

const CHART_HISTORY_LIMIT = 64;

type NodeUserLink = {
  node_id: string;
  user_id: string;
  label: string;
};

function getCurrentUserLinkedLabel(
  user: { email?: string; user_metadata?: Record<string, unknown> } | null,
) {
  if (!user) {
    return "Your account";
  }

  const nickname = user.user_metadata?.nickname;
  const name = user.user_metadata?.name ?? user.user_metadata?.full_name;

  if (typeof nickname === "string" && nickname.trim()) {
    return nickname.trim();
  }

  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  return user.email ?? "Your account";
}

function symbolTypeForCurrentEgo(
  symbolType: KinshipSymbolType,
  nodeId: string,
  currentEgoNodeId: string | null,
  egoSexAssignedAtBirth: "female" | "male" | null,
): KinshipSymbolType {
  if (currentEgoNodeId && nodeId === currentEgoNodeId) {
    if (egoSexAssignedAtBirth === "female") {
      return "female-ego";
    }
    if (egoSexAssignedAtBirth === "male") {
      return "male-ego";
    }

    const gender = getKinshipGender(symbolType);
    return gender === "male" ? "male-ego" : "female-ego";
  }

  if (!currentEgoNodeId || !isEgoSymbolType(symbolType)) {
    return symbolType;
  }

  const gender = getKinshipGender(symbolType);
  return gender === "male" ? "male" : "female";
}

const nodeTypes = {
  kinshipSymbol: KinshipNodeComponent,
  kinshipText: KinshipTextNodeComponent,
  kinshipCluster: KinshipClusterNode,
};

const edgeTypes = {
  married: RelationshipEdge,
  cohabiting: RelationshipEdge,
  divorced: RelationshipEdge,
  separated: RelationshipEdge,
  fictive: RelationshipEdge,
  "descended-from": RelationshipEdge,
};

function formatSaveStamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function buildLineageIndex(nodes: KinshipNode[], edges: KinshipEdge[]) {
  const symbolIds = new Set(
    nodes.filter((node) => isSymbolNode(node)).map((node) => node.id),
  );
  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (edge.data?.relationshipType !== "descended-from") {
      continue;
    }
    if (!symbolIds.has(edge.source) || !symbolIds.has(edge.target)) {
      continue;
    }

    if (!parentsByChild.has(edge.target)) {
      parentsByChild.set(edge.target, new Set());
    }
    parentsByChild.get(edge.target)?.add(edge.source);

    if (!childrenByParent.has(edge.source)) {
      childrenByParent.set(edge.source, new Set());
    }
    childrenByParent.get(edge.source)?.add(edge.target);
  }

  return { parentsByChild, childrenByParent };
}

function buildPartnerIndex(nodes: KinshipNode[], edges: KinshipEdge[]) {
  const symbolIds = new Set(
    nodes.filter((node) => isSymbolNode(node)).map((node) => node.id),
  );
  const partnersByNode = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (edge.data?.relationshipType === "descended-from") {
      continue;
    }
    if (!symbolIds.has(edge.source) || !symbolIds.has(edge.target)) {
      continue;
    }

    if (!partnersByNode.has(edge.source)) {
      partnersByNode.set(edge.source, new Set());
    }
    partnersByNode.get(edge.source)?.add(edge.target);

    if (!partnersByNode.has(edge.target)) {
      partnersByNode.set(edge.target, new Set());
    }
    partnersByNode.get(edge.target)?.add(edge.source);
  }

  return { partnersByNode };
}

function collectSubtree(
  rootId: string,
  childrenByParent: Map<string, Set<string>>,
  partnersByNode: Map<string, Set<string>>,
) {
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    // For the root itself, we add its partners and children, but NOT the root to the hidden list.
    // For others, we add them to visited.
    // Wait, the logic is simpler if we just traverse and at the end remove rootId.
    if (current !== rootId) {
      visited.add(current);
    }

    const children = childrenByParent.get(current);
    if (children) {
      for (const child of children) {
        if (!visited.has(child) && child !== rootId) {
          visited.add(child);
          queue.push(child);
        }
      }
    }

    const partners = partnersByNode.get(current);
    if (partners) {
      for (const partner of partners) {
        if (!visited.has(partner) && partner !== rootId) {
          visited.add(partner);
          queue.push(partner);
        }
      }
    }
  }

  return visited;
}

function mostCommonSurname(nodes: KinshipNode[]) {
  const counts = new Map<string, number>();

  for (const node of nodes) {
    if (!isSymbolNode(node)) {
      continue;
    }
    const label = node.data.label?.trim();
    if (!label) {
      continue;
    }
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    const surname = parts[parts.length - 1];
    if (surname.length < 2) {
      continue;
    }
    counts.set(surname, (counts.get(surname) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [surname, count] of counts) {
    if (count > bestCount) {
      best = surname;
      bestCount = count;
    }
  }

  return best;
}

function isValidConnectionForTool(
  connection: {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
  relationshipType: KinshipRelationshipType,
) {
  if (
    !connection.source ||
    !connection.target ||
    connection.source === connection.target
  ) {
    return false;
  }

  if (relationshipType === "descended-from") {
    return (
      connection.sourceHandle === "bottom" && connection.targetHandle === "top"
    );
  }

  return (
    connection.sourceHandle === "right" && connection.targetHandle === "left"
  );
}

function getPointerClientPosition(
  event:
    | MouseEvent
    | TouchEvent
    | ReactMouseEvent<Element, MouseEvent>
    | ReactTouchEvent<Element>,
) {
  if ("touches" in event && event.touches.length > 0) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  }

  if ("changedTouches" in event && event.changedTouches.length > 0) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }

  if ("clientX" in event) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return {
    x: 0,
    y: 0,
  };
}

export function ChartEditorPage({ chartId }: { chartId: string }) {
  const router = useRouter();
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const initialLoadSkippedRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const copiedSelectionRef = useRef<{
    nodes: KinshipNode[];
    edges: KinshipEdge[];
  } | null>(null);
  const {
    authEnabled,
    lastSync,
    loadingAuth,
    signInWithGoogle,
    supabase,
    syncChart,
    syncError,
    syncNow,
    user,
  } = useAppShell();
  const isOnline = useOnlineStatus();

  const [chartTitle, setChartTitle] = useState("Untitled chart");
  const [createdAt, setCreatedAt] = useState(new Date().toISOString());
  const [activeSymbolType, setActiveSymbolType] =
    useState<KinshipSymbolType | null>(null);
  const [currentTool, setCurrentTool] =
    useState<KinshipRelationshipType | null>(null);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("pointer");
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [edges, setEdges] = useState<KinshipEdge[]>([]);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    KinshipNode,
    KinshipEdge
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [localStatus, setLocalStatus] = useState("Loading chart...");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [nodes, setNodes] = useState<KinshipNode[]>([]);
  const [readyForAutosave, setReadyForAutosave] = useState(false);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [viewport, setViewport] = useState<ChartViewport>(DEFAULT_VIEWPORT);
  const [clipboardReady, setClipboardReady] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);
  // Cloud-save bookkeeping powering the title-pane indicator. `pending` is
  // true when there are local edits that haven't been confirmed by Supabase
  // yet (covers both online roundtrips and offline-queued state).
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savingLocal, setSavingLocal] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudSavedAt, setCloudSavedAt] = useState<string | null>(null);
  const [cloudPending, setCloudPending] = useState(false);
  const [cloudErrored, setCloudErrored] = useState(false);
  const [egoNodeId, setEgoNodeId] = useState<string | null>(null);
  const [chartOwnerId, setChartOwnerId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [invitePending, setInvitePending] = useState(false);
  const [nodeLinksLoading, setNodeLinksLoading] = useState(false);
  const [nodeUserLinks, setNodeUserLinks] = useState<NodeUserLink[]>([]);
  const [egoSexAssignedAtBirth, setEgoSexAssignedAtBirth] = useState<
    "female" | "male" | null
  >(null);
  const [collapseMode, setCollapseMode] = useState(false);
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(
    () => new Set(),
  );

  const chartStateRef = useRef({
    nodes: [] as KinshipNode[],
    edges: [] as KinshipEdge[],
    viewport: DEFAULT_VIEWPORT as ChartViewport,
  });
  const historyPastRef = useRef<
    { nodes: KinshipNode[]; edges: KinshipEdge[]; viewport: ChartViewport }[]
  >([]);
  const historyFutureRef = useRef<
    { nodes: KinshipNode[]; edges: KinshipEdge[]; viewport: ChartViewport }[]
  >([]);
  const skipHistoryRef = useRef(false);
  const nodeDragCommitPendingRef = useRef(false);
  // When set, the next viewport-state sync effect skips its instant
  // setViewport call so an in-flight animated viewport change isn't killed.
  const skipNextViewportSyncRef = useRef(false);

  useEffect(() => {
    chartStateRef.current = { nodes, edges, viewport };
  }, [nodes, edges, viewport]);

  function syncHistoryUi() {
    setUndoAvailable(historyPastRef.current.length > 0);
    setRedoAvailable(historyFutureRef.current.length > 0);
  }

  const commitBeforeChange = useCallback(() => {
    if (skipHistoryRef.current) {
      return;
    }
    historyPastRef.current.push(structuredClone(chartStateRef.current));
    if (historyPastRef.current.length > CHART_HISTORY_LIMIT) {
      historyPastRef.current.shift();
    }
    historyFutureRef.current = [];
    setUndoAvailable(historyPastRef.current.length > 0);
    setRedoAvailable(false);
  }, []);

  const undo = useCallback(() => {
    if (historyPastRef.current.length === 0) {
      return;
    }
    const present = structuredClone(chartStateRef.current);
    historyFutureRef.current.push(present);
    const previous = historyPastRef.current.pop()!;
    skipHistoryRef.current = true;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    const safeViewport = sanitizeChartViewport(previous.viewport);
    setViewport(safeViewport);
    void flowInstance?.setViewport(safeViewport, { duration: 0 });
    queueMicrotask(() => {
      skipHistoryRef.current = false;
      setUndoAvailable(historyPastRef.current.length > 0);
      setRedoAvailable(historyFutureRef.current.length > 0);
    });
  }, [flowInstance]);

  const redo = useCallback(() => {
    if (historyFutureRef.current.length === 0) {
      return;
    }
    const present = structuredClone(chartStateRef.current);
    historyPastRef.current.push(present);
    const next = historyFutureRef.current.pop()!;
    skipHistoryRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    const safeViewport = sanitizeChartViewport(next.viewport);
    setViewport(safeViewport);
    void flowInstance?.setViewport(safeViewport, { duration: 0 });
    queueMicrotask(() => {
      skipHistoryRef.current = false;
      setUndoAvailable(historyPastRef.current.length > 0);
      setRedoAvailable(historyFutureRef.current.length > 0);
    });
  }, [flowInstance]);

  const selectedNodeId = selectedNodeIds[0] ?? null;
  const selectedEdgeId = selectedEdgeIds[0] ?? null;
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const currentUserLinkedNodeId = useMemo(() => {
    if (!user) {
      return null;
    }

    const persistedEgoNodeId =
      nodes.find(
        (node) => isSymbolNode(node) && isEgoSymbolType(node.data.symbolType),
      )?.id ?? null;

    return (
      nodeUserLinks.find((link) => link.user_id === user.id)?.node_id ??
      egoNodeId ??
      (chartOwnerId === user.id ? persistedEgoNodeId : null) ??
      null
    );
  }, [chartOwnerId, egoNodeId, nodeUserLinks, nodes, user]);

  const collapseState = useMemo(() => {
    if (collapsedRoots.size === 0) {
      return {
        hiddenNodeIds: new Set<string>(),
      };
    }

    const { childrenByParent } = buildLineageIndex(nodes, edges);
    const { partnersByNode } = buildPartnerIndex(nodes, edges);

    const hiddenNodeIds = new Set<string>();

    for (const rootId of collapsedRoots) {
      const rootNode = nodes.find((node) => node.id === rootId);
      if (!rootNode || !isSymbolNode(rootNode)) {
        continue;
      }

      const subtreeHidden = collectSubtree(
        rootId,
        childrenByParent,
        partnersByNode,
      );
      for (const id of subtreeHidden) {
        hiddenNodeIds.add(id);
      }
    }

    return { hiddenNodeIds };
  }, [collapsedRoots, edges, nodes]);

  const displayNodes = useMemo<KinshipNode[]>(() => {
    return nodes.map((node) => {
      if (!isSymbolNode(node)) {
        return node;
      }

      const symbolType = symbolTypeForCurrentEgo(
        node.data.symbolType,
        node.id,
        currentUserLinkedNodeId,
        egoSexAssignedAtBirth,
      );

      const baseNode =
        symbolType === node.data.symbolType
          ? node
          : {
              ...node,
              data: {
                ...node.data,
                symbolType,
              },
            };

      if (collapseState.hiddenNodeIds.has(node.id)) {
        return { ...baseNode, hidden: true };
      }

      if (collapsedRoots.has(node.id)) {
        return {
          ...baseNode,
          data: {
            ...baseNode.data,
            isCollapsedBranchRoot: true,
          },
        };
      }

      return baseNode;
    });
  }, [
    collapseState,
    collapsedRoots,
    currentUserLinkedNodeId,
    egoSexAssignedAtBirth,
    nodes,
  ]);

  const displayEdges = useMemo(() => {
    if (collapseState.hiddenNodeIds.size === 0) {
      return edges;
    }

    return edges.map((edge) => {
      if (
        collapseState.hiddenNodeIds.has(edge.source) ||
        collapseState.hiddenNodeIds.has(edge.target)
      ) {
        return { ...edge, hidden: true };
      }
      return edge;
    });
  }, [collapseState, edges]);
  const selectedDisplayNode = useMemo(
    () => displayNodes.find((node) => node.id === selectedNodeId) ?? null,
    [displayNodes, selectedNodeId],
  );
  const selectedNodeUserLink = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }

    const persistedLink =
      nodeUserLinks.find((link) => link.node_id === selectedNodeId) ?? null;

    if (persistedLink) {
      return persistedLink;
    }

    if (selectedNodeId === currentUserLinkedNodeId && user) {
      return {
        node_id: selectedNodeId,
        user_id: user.id,
        label: getCurrentUserLinkedLabel(user),
      };
    }

    return null;
  }, [currentUserLinkedNodeId, nodeUserLinks, selectedNodeId, user]);
  const canManageNodeLinks = Boolean(
    authEnabled && user && chartOwnerId === user.id,
  );
  const canInviteNodeLinks = Boolean(authEnabled && user);

  function arraysEqual(left: string[], right: string[]) {
    if (left === right) {
      return true;
    }
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  }
  const derivedKinshipLabels = useMemo(
    () => deriveKinshipLabels(nodes, edges, currentUserLinkedNodeId),
    [currentUserLinkedNodeId, edges, nodes],
  );
  const activeTool = useMemo(
    () =>
      currentTool
        ? (RELATIONSHIP_TOOLS.find((tool) => tool.type === currentTool) ?? null)
        : null,
    [currentTool],
  );
  const connectionLineComponent = useMemo(
    () =>
      function ConnectionLinePreview(
        connectionProps: ConnectionLineComponentProps<KinshipNode>,
      ) {
        return (
          <RelationshipConnectionLine
            {...connectionProps}
            relationshipType={currentTool ?? "descended-from"}
          />
        );
      },
    [currentTool],
  );

  const documentSnapshot = useMemo<ChartDocument | null>(() => {
    if (!readyForAutosave) {
      return null;
    }

    return buildChartDocumentSnapshot({
      title: chartTitle,
      createdAt,
      viewport,
      nodes,
      edges,
    });
  }, [chartTitle, createdAt, edges, nodes, readyForAutosave, viewport]);

  const saveDocumentNow = useCallback(
    async (document: ChartDocument, dirty = true) => {
      setSavingLocal(true);
      const saved = await saveChartDocument(chartId, document, { dirty });
      startTransition(() => {
        setSavingLocal(false);
        setSavedAt(saved.updatedAt);
        setLocalStatus(`Saved offline at ${formatSaveStamp(saved.updatedAt)}`);
        if (dirty && authEnabled && user) {
          setCloudPending(true);
        }
      });
      return saved;
    },
    [authEnabled, chartId, user],
  );

  const persistImmediateSnapshot = useCallback(
    ({
      nextEdges = edges,
      nextNodes = nodes,
      nextTitle = chartTitle,
      nextViewport = viewport,
    }: {
      nextEdges?: KinshipEdge[];
      nextNodes?: KinshipNode[];
      nextTitle?: string;
      nextViewport?: ChartViewport;
    }) => {
      skipNextAutosaveRef.current = true;
      const snapshot = buildChartDocumentSnapshot({
        title: nextTitle,
        createdAt,
        viewport: nextViewport,
        nodes: nextNodes,
        edges: nextEdges,
      });

      void saveDocumentNow(snapshot, true);
    },
    [chartTitle, createdAt, edges, nodes, saveDocumentNow, viewport],
  );

  const handleAiMerge = useCallback(
    (fragment: { nodes: KinshipNode[]; edges: KinshipEdge[] }) => {
      commitBeforeChange();
      const nextNodes = [...nodes, ...fragment.nodes];
      const nextEdges = [...edges, ...fragment.edges];
      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
      persistImmediateSnapshot({ nextNodes, nextEdges });
    },
    [commitBeforeChange, edges, nodes, persistImmediateSnapshot],
  );

  const refreshNodeUserLinks = useCallback(async () => {
    if (!authEnabled || !user || !supabase) {
      setNodeUserLinks([]);
      return;
    }

    setNodeLinksLoading(true);
    const { data, error } = await supabase.rpc("get_kinship_node_user_links", {
      target_chart_id: chartId,
    });

    if (error || !data) {
      setNodeLinksLoading(false);
      return;
    }

    startTransition(() =>
      setNodeUserLinks(
        data.map((link: any) => ({
          node_id: link.node_id,
          user_id: link.user_id,
          label: link.label ?? "Linked user",
        })),
      ),
    );
    setNodeLinksLoading(false);
  }, [authEnabled, chartId, supabase, user]);

  useEffect(() => {
    if (!authEnabled || !user || !supabase) {
      setEgoSexAssignedAtBirth(null);
      return;
    }

    void supabase
      .from("users")
      .select("sex_assigned_at_birth")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.sex_assigned_at_birth;
        setEgoSexAssignedAtBirth(
          value === "female" || value === "male" ? value : null,
        );
      });
  }, [authEnabled, supabase, user]);

  useEffect(() => {
    let active = true;

    const applyRecord = (freshRecord: ChartRecord) => {
      if (!active) {
        return;
      }

      startTransition(() => {
        setChartTitle(freshRecord.document.meta.title);
        setCreatedAt(freshRecord.document.meta.createdAt);
        setNodes(hydrateNodes(freshRecord.document.nodes));
        setEdges(hydrateEdges(freshRecord.document.edges));
        setViewport(
          sanitizeChartViewport(
            freshRecord.document.viewport ?? DEFAULT_VIEWPORT,
          ),
        );
        setLocalStatus(
          freshRecord.updatedAt
            ? `Saved offline at ${formatSaveStamp(freshRecord.updatedAt)}`
            : "Ready",
        );
        setChartOwnerId(freshRecord.ownerId ?? null);
        // Seed the indicator from the persisted record so the title pill
        // displays "Saved" immediately on open instead of flashing through
        // a "Loading" state until the next event.
        setSavedAt(freshRecord.updatedAt ?? null);
        if (authEnabled && user) {
          setEgoNodeId(freshRecord.egoNodeId ?? null);
          if (freshRecord.dirty) {
            setCloudPending(true);
            setCloudSavedAt(freshRecord.lastSyncedAt ?? null);
          } else {
            setCloudPending(false);
            setCloudSavedAt(
              freshRecord.lastSyncedAt ?? freshRecord.updatedAt ?? null,
            );
          }
        }
        setLoading(false);
        setReadyForAutosave(true);
        historyPastRef.current = [];
        historyFutureRef.current = [];
        setUndoAvailable(false);
        setRedoAvailable(false);
      });
    };

    const loadChart = async () => {
      if (!authEnabled) {
        const record = await ensureChartRecord(chartId);
        const freshRecord = (await getChartRecord(chartId)) ?? record;
        applyRecord(freshRecord);
        return;
      }

      if (loadingAuth) {
        return;
      }

      if (!user || !supabase) {
        router.replace("/");
        return;
      }

      const local = await getChartRecord(chartId);
      if (
        local &&
        !local.deleted &&
        (local.ownerId === user.id || local.memberIds?.includes(user.id))
      ) {
        const { data: membership } = await supabase
          .from("chart_members")
          .select("ego_node_id")
          .eq("chart_id", chartId)
          .eq("user_id", user.id)
          .maybeSingle();
        const localWithMembership = {
          ...local,
          egoNodeId: membership?.ego_node_id ?? local.egoNodeId ?? null,
        };
        await saveChartRecord(localWithMembership);
        void refreshNodeUserLinks();
        applyRecord(localWithMembership);
        return;
      }

      const [{ data, error }, { data: membership }] = await Promise.all([
        supabase
          .from("charts")
          .select("id, user_id, title, document, updated_at")
          .eq("id", chartId)
          .maybeSingle(),
        supabase
          .from("chart_members")
          .select("ego_node_id")
          .eq("chart_id", chartId)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (!active) {
        return;
      }

      if (error || !data) {
        router.replace("/");
        return;
      }

      const saved = remoteChartToLocal(data, user.id, membership ?? undefined);
      await saveChartRecord(saved);
      await refreshNodeUserLinks();
      applyRecord(saved);
    };

    void loadChart();

    return () => {
      active = false;
    };
  }, [
    authEnabled,
    chartId,
    loadingAuth,
    refreshNodeUserLinks,
    router,
    supabase,
    user,
  ]);

  useEffect(() => {
    if (!flowInstance || loading) {
      return;
    }

    if (skipNextViewportSyncRef.current) {
      skipNextViewportSyncRef.current = false;
      return;
    }

    void flowInstance.setViewport(sanitizeChartViewport(viewport), {
      duration: 0,
    });
  }, [flowInstance, loading, viewport]);

  const autosaveController = useMemo(
    () =>
      createDebouncedAction<ChartDocument>((document) => {
        void saveDocumentNow(document, true);
      }, AUTOSAVE_DELAY_MS),
    [saveDocumentNow],
  );

  useEffect(() => {
    if (!documentSnapshot) {
      return;
    }

    if (!initialLoadSkippedRef.current) {
      initialLoadSkippedRef.current = true;
      return;
    }

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    setLocalStatus("Changes pending...");
    autosaveController.trigger(documentSnapshot);
    return () => {
      autosaveController.cancel();
    };
  }, [autosaveController, documentSnapshot]);

  useEffect(() => {
    const flushPendingChanges = () => {
      if (documentSnapshot) {
        autosaveController.flush(documentSnapshot);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingChanges();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", flushPendingChanges);
    window.addEventListener("pagehide", flushPendingChanges);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", flushPendingChanges);
      window.removeEventListener("pagehide", flushPendingChanges);
    };
  }, [autosaveController, documentSnapshot]);

  useEffect(() => {
    if (!lastSync) {
      return;
    }

    void getChartRecord(chartId).then((record) => {
      if (!record || record.deleted) {
        return;
      }

      const stamp = new Date().toISOString();
      startTransition(() => {
        setLocalStatus(`Saved offline at ${formatSaveStamp(record.updatedAt)}`);
        setCloudSaving(false);
        setCloudErrored(false);
        // The Dexie row is the source of truth for "are there unsynced
        // edits?". `dirty` is cleared by `pushChart` after the Supabase
        // upsert succeeds, so honor it here.
        setCloudPending(Boolean(record.dirty));
        if (!record.dirty) {
          setCloudSavedAt(stamp);
        }
      });
    });
  }, [chartId, lastSync]);

  useEffect(() => {
    if (!syncError) {
      return;
    }
    setCloudSaving(false);
    setCloudErrored(true);
  }, [syncError]);

  // Fire the cloud push immediately when there are pending local changes
  // and we are online + signed in. The autosave debounce (AUTOSAVE_DELAY_MS)
  // already coalesces rapid edits before the IndexedDB write that flips
  // `cloudPending` true, so a second debounce here just adds latency.
  // `cloudSaving` gates re-entry so we never have two upserts in flight; if
  // the user keeps editing during a push, the next render observes
  // `cloudPending` again after `cloudSaving` clears and triggers another.
  useEffect(() => {
    if (
      !cloudPending ||
      !authEnabled ||
      !user ||
      !supabase ||
      !isOnline ||
      cloudSaving
    ) {
      return;
    }
    setCloudSaving(true);
    setCloudErrored(false);
    // syncChart updates `lastSync` in app-shell, which the effect above
    // observes to clear `cloudPending` and stamp `cloudSavedAt`.
    void syncChart(chartId);
  }, [
    authEnabled,
    chartId,
    cloudPending,
    cloudSaving,
    isOnline,
    supabase,
    syncChart,
    user,
  ]);

  function addNode(symbolType: KinshipSymbolType, x: number, y: number) {
    commitBeforeChange();
    const newNode = createKinshipNode({
      id: crypto.randomUUID(),
      symbolType,
      label: "",
      x,
      y,
    });

    setNodes((current) => [...current, newNode]);
    setSelectedNodeIds([newNode.id]);
    setSelectedEdgeIds([]);
  }

  function armSymbolPlacement(symbolType: KinshipSymbolType) {
    setActiveSymbolType(symbolType);
    setCurrentTool(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }

  function placeSymbolAtClientPoint(
    symbolType: KinshipSymbolType,
    clientX: number,
    clientY: number,
  ) {
    if (!flowInstance) {
      addNode(symbolType, 120, 120);
      return;
    }

    const position = flowInstance.screenToFlowPosition({
      x: clientX,
      y: clientY,
    });

    addNode(
      symbolType,
      position.x - NODE_WIDTH / 2,
      position.y - NODE_HEIGHT / 2,
    );
  }

  function addTextNode(x: number, y: number) {
    commitBeforeChange();
    const textNode = createKinshipTextNode({
      id: crypto.randomUUID(),
      x,
      y,
    });
    setNodes((current) => [...current, textNode]);
    setSelectedNodeIds([textNode.id]);
    setSelectedEdgeIds([]);
  }

  function placeTextAtClientPoint(clientX: number, clientY: number) {
    if (!flowInstance) {
      addTextNode(120, 120);
      return;
    }
    const position = flowInstance.screenToFlowPosition({
      x: clientX,
      y: clientY,
    });
    addTextNode(
      position.x - TEXT_NODE_INITIAL_WIDTH / 2,
      position.y - TEXT_NODE_INITIAL_HEIGHT / 2,
    );
  }

  function startRelationshipMode(relationshipType: KinshipRelationshipType) {
    setCurrentTool(relationshipType);
    setActiveSymbolType(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }

  async function flushThenSync() {
    if (documentSnapshot) {
      await saveDocumentNow(documentSnapshot, true);
    }

    const summary = await syncNow();
    if (summary) {
      setLocalStatus(
        `Cloud sync complete: ${summary.pushed} pushed, ${summary.pulled} pulled, ${summary.conflicts} conflicts.`,
      );
    }
  }

  async function handleExport(kind: "pdf" | "png") {
    const viewportElement = flowWrapperRef.current?.querySelector(
      ".react-flow__viewport",
    );

    if (!(viewportElement instanceof HTMLElement)) {
      return;
    }

    setExporting(kind);

    try {
      if (kind === "png") {
        await exportChartAsPng(viewportElement, nodes, chartTitle);
      } else {
        await exportChartAsPdf(viewportElement, nodes, chartTitle);
      }
    } finally {
      setExporting(null);
    }
  }

  function deleteCurrentSelection() {
    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
      return;
    }

    commitBeforeChange();
    const nodeIdSet = new Set(selectedNodeIds);
    const edgeIdSet = new Set(selectedEdgeIds);

    setNodes((current) => current.filter((node) => !nodeIdSet.has(node.id)));
    setEdges((current) =>
      current.filter((edge) => {
        if (edgeIdSet.has(edge.id)) {
          return false;
        }

        if (nodeIdSet.has(edge.source) || nodeIdSet.has(edge.target)) {
          return false;
        }

        return true;
      }),
    );

    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }

  function copySelection() {
    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
      copiedSelectionRef.current = null;
      setClipboardReady(false);
      return;
    }

    const nodeIdSet = new Set(selectedNodeIds);
    const selectedNodes = nodes.filter((node) => nodeIdSet.has(node.id));
    const selectedEdges = edges.filter((edge) => {
      if (selectedEdgeIds.includes(edge.id)) {
        return true;
      }
      return nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target);
    });

    copiedSelectionRef.current = { nodes: selectedNodes, edges: selectedEdges };
    setClipboardReady(true);
  }

  function pasteSelection(offset = { x: 48, y: 48 }) {
    const snapshot = copiedSelectionRef.current;
    if (!snapshot || snapshot.nodes.length === 0) {
      return;
    }

    commitBeforeChange();
    const idMap = new Map<string, string>();
    const pastedNodes: KinshipNode[] = snapshot.nodes.map((node) => {
      const nextId = crypto.randomUUID();
      idMap.set(node.id, nextId);
      return {
        ...node,
        id: nextId,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
        selected: true,
      };
    });

    const pastedEdges = snapshot.edges.reduce<KinshipEdge[]>((acc, edge) => {
      const nextSource = idMap.get(edge.source);
      const nextTarget = idMap.get(edge.target);
      if (!nextSource || !nextTarget) {
        return acc;
      }

      acc.push({
        ...edge,
        id: crypto.randomUUID(),
        source: nextSource,
        target: nextTarget,
        selected: true,
      });
      return acc;
    }, []);

    setNodes((current) => [...current, ...pastedNodes]);
    setEdges((current) => [...current, ...pastedEdges]);
    setSelectedNodeIds(pastedNodes.map((node) => node.id));
    setSelectedEdgeIds(pastedEdges.map((edge) => edge.id));
  }

  function duplicateSelection() {
    copySelection();
    pasteSelection({ x: 36, y: 36 });
  }

  const keyboardShortcutsRef = useRef({
    copySelection: () => {},
    pasteSelection: () => {},
    duplicateSelection: () => {},
    undo,
    redo,
  });
  keyboardShortcutsRef.current = {
    copySelection,
    pasteSelection,
    duplicateSelection,
    undo,
    redo,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest?.("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          keyboardShortcutsRef.current.redo();
        } else {
          keyboardShortcutsRef.current.undo();
        }
        return;
      }

      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        keyboardShortcutsRef.current.redo();
        return;
      }

      if (mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        keyboardShortcutsRef.current.copySelection();
        return;
      }

      if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        keyboardShortcutsRef.current.pasteSelection();
        return;
      }

      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        keyboardShortcutsRef.current.duplicateSelection();
        return;
      }

      if (event.key === "Escape") {
        setActiveSymbolType(null);
        setCurrentTool(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const applyIdealViewport = useCallback(() => {
    commitBeforeChange();
    const pane = flowWrapperRef.current;
    const paneRect = pane?.getBoundingClientRect();
    const nextViewport =
      paneRect && nodes.length > 0
        ? (computeEgoBiasedViewport({
            mode: "defaultZoom",
            nodes: displayNodes,
            flowWidth: paneRect.width,
            flowHeight: paneRect.height,
            windowWidth:
              typeof window !== "undefined"
                ? window.innerWidth
                : EDITOR_VIEWPORT_LG_BREAKPOINT_PX,
            minZoom: 0.2,
            maxZoom: 2.25,
          }) ?? DEFAULT_VIEWPORT)
        : DEFAULT_VIEWPORT;

    const safeViewport = sanitizeChartViewport(nextViewport);
    if (flowInstance) {
      skipNextViewportSyncRef.current = true;
      void flowInstance.setViewport(safeViewport, { duration: 220 });
    }
    startTransition(() => {
      setViewport(safeViewport);
    });
    persistImmediateSnapshot({ nextViewport: safeViewport });
  }, [
    commitBeforeChange,
    displayNodes,
    flowInstance,
    nodes.length,
    persistImmediateSnapshot,
  ]);

  const fitViewToContent = useCallback(() => {
    const pane = flowWrapperRef.current;
    if (!pane || !flowInstance || nodes.length === 0) {
      return;
    }

    const rect = pane.getBoundingClientRect();
    const nextViewport = computeEgoBiasedViewport({
      mode: "fit",
      nodes: displayNodes,
      flowWidth: rect.width,
      flowHeight: rect.height,
      windowWidth:
        typeof window !== "undefined"
          ? window.innerWidth
          : EDITOR_VIEWPORT_LG_BREAKPOINT_PX,
      minZoom: 0.2,
      maxZoom: 2.25,
    });

    if (!nextViewport) {
      return;
    }

    const safeViewport = sanitizeChartViewport(nextViewport);
    commitBeforeChange();
    skipNextViewportSyncRef.current = true;
    void flowInstance.setViewport(safeViewport, { duration: 300 });
    startTransition(() => {
      setViewport(safeViewport);
    });
    persistImmediateSnapshot({ nextViewport: safeViewport });
  }, [
    commitBeforeChange,
    displayNodes,
    flowInstance,
    nodes.length,
    persistImmediateSnapshot,
  ]);

  const cloudStatus = authEnabled
    ? user
      ? "Signed in. Sync keeps private Supabase copies in step with local charts."
      : "Working locally until you sign in from the dashboard."
    : "Supabase is not configured. Local offline saving is still active.";

  /**
   * Pure derivation of the title-pane "Saving / Saved" badge based on
   * online status, auth state, and the local/cloud bookkeeping above.
   * Order matters: error and offline take priority over the optimistic
   * "Saved to cloud" so the user always sees the most actionable label.
   */
  const saveStatusState = useMemo<SaveStatusState>(() => {
    if (loading) {
      return { kind: "loading" };
    }
    if (savingLocal) {
      return { kind: "saving-local" };
    }
    if (authEnabled && user) {
      if (!isOnline) {
        return cloudPending && savedAt
          ? { kind: "offline-pending", savedAt }
          : { kind: "offline-idle" };
      }
      if (cloudErrored) {
        return {
          kind: "error",
          message: syncError ?? "Cloud sync failed. Click to retry.",
        };
      }
      if (cloudSaving || cloudPending) {
        return { kind: "saving-cloud" };
      }
      if (cloudSavedAt) {
        return { kind: "saved-cloud", savedAt: cloudSavedAt };
      }
      if (savedAt) {
        return { kind: "saved-cloud", savedAt };
      }
      return { kind: "loading" };
    }
    if (savedAt) {
      return { kind: "saved-local", savedAt };
    }
    return { kind: "edited" };
  }, [
    authEnabled,
    cloudErrored,
    cloudPending,
    cloudSaving,
    cloudSavedAt,
    isOnline,
    loading,
    savedAt,
    savingLocal,
    syncError,
    user,
  ]);

  const retryCloudSync = useCallback(() => {
    setCloudErrored(false);
    setCloudSaving(true);
    void syncNow();
  }, [syncNow]);

  /**
   * Patch the currently-selected text node's data. Used by the inspector
   * controls (font, size, color, bold, italic, content). Skips work if no
   * text node is selected so callers don't need to guard.
   */
  const handleTextNodeChange = useCallback(
    (patch: Partial<KinshipTextNodeData>) => {
      if (!selectedNodeId) {
        return;
      }
      const target = nodes.find((node) => node.id === selectedNodeId);
      if (!target || !isTextNode(target)) {
        return;
      }
      commitBeforeChange();
      const nextNodes = updateNodeData(nodes, selectedNodeId, patch);
      setNodes(nextNodes);
      persistImmediateSnapshot({ nextNodes });
    },
    [commitBeforeChange, nodes, persistImmediateSnapshot, selectedNodeId],
  );

  const handleNodeUserInvite = useCallback(
    async (email: string) => {
      if (!authEnabled || !user || !supabase || !selectedNodeId) {
        setInviteFeedback("Sign in and select a symbol node first.");
        return;
      }

      const target = nodes.find((node) => node.id === selectedNodeId);
      if (!target || !isSymbolNode(target)) {
        setInviteFeedback("Only kinship symbol nodes can be linked to users.");
        return;
      }

      if (selectedNodeUserLink) {
        setInviteFeedback("This node is already linked to an account.");
        return;
      }

      setInvitePending(true);
      setInviteFeedback(null);

      const normalizedEmail = email.trim().toLowerCase();
      const { data: invitee, error: lookupError } = await supabase
        .from("users")
        .select("id, email, sex_assigned_at_birth")
        .ilike("email", normalizedEmail)
        .maybeSingle();

      if (lookupError || !invitee) {
        setInviteFeedback("No user profile was found for that email.");
        setInvitePending(false);
        return;
      }

      if (!invitee.sex_assigned_at_birth) {
        setInviteFeedback("The invited user must complete their profile (including sex assigned at birth) before they can be linked.");
        setInvitePending(false);
        return;
      }

      const inviteeSex = String(invitee.sex_assigned_at_birth).toLowerCase().trim();
      const isMaleNode = isMaleSymbolType(target.data.symbolType);
      
      if (isMaleNode && inviteeSex === "female") {
        setInviteFeedback("Cannot link a female user to a male node.");
        setInvitePending(false);
        return;
      }
      
      if (!isMaleNode && inviteeSex === "male") {
        setInviteFeedback("Cannot link a male user to a female node.");
        setInvitePending(false);
        return;
      }

      if (invitee.id === user.id) {
        setInviteFeedback("You are already signed in as that user.");
        setInvitePending(false);
        return;
      }

      const { data: existingLink, error: existingLinkError } = await supabase
        .from("kinship_node_user_links")
        .select("node_id")
        .eq("chart_id", chartId)
        .eq("user_id", invitee.id)
        .maybeSingle();

      if (existingLinkError) {
        setInviteFeedback(existingLinkError.message);
        setInvitePending(false);
        return;
      }

      if (existingLink) {
        setInviteFeedback(
          "That account is already linked to another node in this chart.",
        );
        setInvitePending(false);
        return;
      }

      const { data: existingInvite, error: existingInviteError } =
        await supabase
          .from("kinship_node_invitations")
          .select("node_id")
          .eq("chart_id", chartId)
          .eq("invitee_id", invitee.id)
          .eq("status", "pending")
          .maybeSingle();

      if (existingInviteError) {
        setInviteFeedback(existingInviteError.message);
        setInvitePending(false);
        return;
      }

      if (existingInvite) {
        setInviteFeedback(
          "That account already has a pending invitation in this chart.",
        );
        setInvitePending(false);
        return;
      }

      const { error } = await supabase.from("kinship_node_invitations").insert({
        chart_id: chartId,
        node_id: selectedNodeId,
        inviter_id: user.id,
        invitee_id: invitee.id,
      });

      if (error) {
        setInviteFeedback(error.message);
        setInvitePending(false);
        return;
      }

      setInviteFeedback("Invitation sent. It will appear in their dashboard.");
      setInvitePending(false);
    },
    [
      authEnabled,
      chartId,
      nodes,
      selectedNodeId,
      selectedNodeUserLink,
      supabase,
      user,
    ],
  );

  const handleNodeUserUnlink = useCallback(async () => {
    if (!authEnabled || !user || !supabase || !selectedNodeId) {
      return;
    }

    if (chartOwnerId !== user.id) {
      setInviteFeedback("Only the chart owner can remove linked accounts.");
      return;
    }

    setInvitePending(true);
    setInviteFeedback(null);
    const { error } = await supabase.rpc("unlink_kinship_node_user", {
      target_chart_id: chartId,
      target_node_id: selectedNodeId,
    });

    if (error) {
      setInviteFeedback(error.message);
      setInvitePending(false);
      return;
    }

    if (selectedNodeId === currentUserLinkedNodeId) {
      setEgoNodeId(null);
    }
    await refreshNodeUserLinks();
    setInviteFeedback("Linked account removed.");
    setInvitePending(false);
  }, [
    authEnabled,
    chartId,
    chartOwnerId,
    currentUserLinkedNodeId,
    refreshNodeUserLinks,
    selectedNodeId,
    supabase,
    user,
  ]);

  return (
    <KinshipEditorProvider
      value={{
        getNodeLabelState(id, label) {
          const derivedLabel = derivedKinshipLabels.labelsByNodeId[id];

          if (derivedLabel) {
            return {
              description: derivedLabel.description,
              isAutoDerived: true,
              value: derivedLabel.abbreviation,
            };
          }

          return {
            isAutoDerived: false,
            value: label,
          };
        },
        showConnectionHandles: currentTool !== null,
        updateNodeLabel(id, label) {
          // Symbol-node label edit. No-op (early-return) for text nodes —
          // their label is the `text` field, edited via updateTextNodeText.
          const target = nodes.find((node) => node.id === id);
          if (!target || !isSymbolNode(target)) {
            return;
          }
          commitBeforeChange();
          const nextNodes = updateNodeData(nodes, id, { label });
          setNodes(nextNodes);
          persistImmediateSnapshot({ nextNodes });
        },
        updateTextNodeText(id, text) {
          const target = nodes.find((node) => node.id === id);
          if (!target || !isTextNode(target)) {
            return;
          }
          if (target.data.text === text) {
            return;
          }
          commitBeforeChange();
          const nextNodes = updateNodeData(nodes, id, { text });
          setNodes(nextNodes);
          persistImmediateSnapshot({ nextNodes });
        },
        updateTextNodeData(id, patch) {
          const target = nodes.find((node) => node.id === id);
          if (!target || !isTextNode(target)) {
            return;
          }
          // Single commit per call — callers that drive a continuous gesture
          // (e.g. rotation drag) should hold the in-progress value in local
          // component state and only fire this once on pointerup.
          commitBeforeChange();
          const nextNodes = updateNodeData(nodes, id, patch);
          setNodes(nextNodes);
          persistImmediateSnapshot({ nextNodes });
        },
      }}
    >
      <main className="h-screen w-screen overflow-hidden bg-white">
        {/* Full-screen canvas - base layer */}
        <section className="fixed inset-0 z-0">
          <div
            ref={flowWrapperRef}
            data-testid="kinship-canvas"
            className="kinship-canvas-surface relative h-full w-full"
          >
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-ink-soft">
                Loading chart...
              </div>
            ) : (
              <ReactFlow
                className={`kinship-canvas-grid ${
                  canvasTool === "hand"
                    ? "canvas-tool-hand"
                    : "canvas-tool-pointer"
                }`}
                style={{ width: "100%", height: "100%" }}
                nodes={displayNodes}
                edges={displayEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                connectionLineComponent={connectionLineComponent}
                isValidConnection={(connection) =>
                  currentTool
                    ? isValidConnectionForTool(connection, currentTool)
                    : false
                }
                onInit={setFlowInstance}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const relationshipType = event.dataTransfer.getData(
                    "application/kinship-relationship",
                  ) as KinshipRelationshipType;
                  if (relationshipType) {
                    startRelationshipMode(relationshipType);
                    return;
                  }

                  const annotation = event.dataTransfer.getData(
                    KINSHIP_TEXT_DRAG_MIME,
                  );
                  if (annotation === KINSHIP_TEXT_DRAG_VALUE) {
                    setActiveSymbolType(null);
                    placeTextAtClientPoint(event.clientX, event.clientY);
                    return;
                  }

                  const symbolType = event.dataTransfer.getData(
                    "application/kinship-symbol",
                  ) as KinshipSymbolType;

                  if (!symbolType || !flowInstance) {
                    return;
                  }

                  setActiveSymbolType(null);
                  placeSymbolAtClientPoint(
                    symbolType,
                    event.clientX,
                    event.clientY,
                  );
                }}
                onMoveEnd={(_, nextViewport) => {
                  setViewport(sanitizeChartViewport(nextViewport));
                }}
                onConnect={(connection: Connection) => {
                  if (
                    !currentTool ||
                    !isValidConnectionForTool(connection, currentTool)
                  ) {
                    return;
                  }

                  commitBeforeChange();

                  const newEdge: KinshipEdge = {
                    id: crypto.randomUUID(),
                    source: connection.source ?? "",
                    target: connection.target ?? "",
                    sourceHandle: connection.sourceHandle,
                    targetHandle: connection.targetHandle,
                    type: currentTool,
                    data: {
                      relationshipType: currentTool,
                      label: "",
                    },
                  };

                  setEdges((current) => addEdge(newEdge, current));
                  setSelectedEdgeIds([newEdge.id]);
                  setSelectedNodeIds([]);
                }}
                onNodesChange={(changes) => {
                  const editableIds = new Set(nodes.map((node) => node.id));
                  const safeChanges = changes.filter((change) => {
                    const changeId =
                      "id" in change
                        ? change.id
                        : "item" in change
                          ? change.item.id
                          : null;
                    return changeId ? editableIds.has(changeId) : true;
                  });
                  if (safeChanges.some((c) => c.type === "remove")) {
                    commitBeforeChange();
                  }
                  setNodes((current) => applyNodeChanges(safeChanges, current));
                }}
                onEdgesChange={(changes) => {
                  if (changes.some((c) => c.type === "remove")) {
                    commitBeforeChange();
                  }
                  setEdges((current) => applyEdgeChanges(changes, current));
                }}
                onNodeClick={(event, node) => {
                  const target = event.target as HTMLElement | null;
                  if (target?.closest(".react-flow__handle")) {
                    return;
                  }
                  if (node.id.startsWith("cluster:")) {
                    const rootId = node.id.replace("cluster:", "");
                    setCollapsedRoots((current) => {
                      const next = new Set(current);
                      next.delete(rootId);
                      return next;
                    });
                    setSelectedNodeIds([]);
                    setSelectedEdgeIds([]);
                    return;
                  }
                  setCurrentTool((tool) => (tool !== null ? null : tool));
                }}
                onNodeDragStart={() => {
                  if (!nodeDragCommitPendingRef.current) {
                    commitBeforeChange();
                    nodeDragCommitPendingRef.current = true;
                  }
                }}
                onNodeDragStop={() => {
                  nodeDragCommitPendingRef.current = false;
                }}
                onSelectionChange={({
                  edges: selectedEdges,
                  nodes: selectedNodes,
                }) => {
                  if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                    setActiveSymbolType(null);
                  }
                  const nextNodeIds = selectedNodes.map((node) => node.id);
                  const nextEdgeIds = selectedEdges.map((edge) => edge.id);

                  setSelectedNodeIds((current) =>
                    arraysEqual(current, nextNodeIds) ? current : nextNodeIds,
                  );
                  setSelectedEdgeIds((current) =>
                    arraysEqual(current, nextEdgeIds) ? current : nextEdgeIds,
                  );
                }}
                onPaneClick={() => {
                  setCurrentTool(null);
                  setSelectedNodeIds((current) =>
                    current.length === 0 ? current : [],
                  );
                  setSelectedEdgeIds((current) =>
                    current.length === 0 ? current : [],
                  );
                }}
                deleteKeyCode={["Backspace", "Delete"]}
                panOnDrag={canvasTool === "hand" ? [0, 1, 2] : [1, 2]}
                selectionOnDrag={canvasTool === "pointer"}
                multiSelectionKeyCode={["Shift"]}
                panActivationKeyCode="Space"
                defaultViewport={viewport}
                minZoom={0.2}
                maxZoom={2.25}
                snapGrid={SNAP_GRID}
                snapToGrid
              >
                <MiniMap
                  position="bottom-left"
                  pannable
                  zoomable
                  nodeColor={(node) => {
                    const k = node as KinshipNode;
                    if (isTextNode(k)) {
                      return "#a8997e";
                    }
                    if (isSymbolNode(k)) {
                      return isMaleSymbolType(k.data.symbolType)
                        ? "#88a6cb"
                        : "#d9703b";
                    }
                    return "#a8997e";
                  }}
                />
                <Controls position="bottom-right" showInteractive={false} />
                <Background
                  color="rgba(128, 118, 103, 0.22)"
                  gap={24}
                  variant={BackgroundVariant.Lines}
                />
              </ReactFlow>
            )}

            <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center z-20 lg:hidden">
              <div className="pointer-events-auto flex gap-2 rounded-full border border-line bg-panel-strong/95 p-2 shadow-xl">
                <button
                  type="button"
                  onClick={() => setMobilePaletteOpen(true)}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
                >
                  Symbols
                </button>
                <button
                  type="button"
                  onClick={() => setMobileInspectorOpen(true)}
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                >
                  Inspector
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Palette clears the title panel (~96px tall on lg). */}
        <aside className="kinship-floating-panel fixed left-3 top-[112px] z-40 hidden max-h-[calc(100vh-136px)] w-52 overflow-auto rounded-[1.2rem] p-2.5 lg:flex lg:flex-col">
          <SymbolPalette
            activeSymbolType={activeSymbolType}
            onPickSymbol={armSymbolPlacement}
            onStartRelationship={startRelationshipMode}
            currentTool={currentTool}
          />
        </aside>

        {/* Inspector clears the toolbar panel (~56px tall on lg). */}
        <aside className="kinship-floating-panel fixed right-3 top-[76px] z-40 hidden max-h-[calc(100vh-100px)] w-64 overflow-auto rounded-[1.2rem] p-2.5 lg:block">
          <InspectorPanel
            cloudStatus={cloudStatus}
            isNodeCollapsed={
              selectedNodeId ? collapsedRoots.has(selectedNodeId) : false
            }
            onToggleCollapse={
              selectedNodeId && edges.some((e) => e.target === selectedNodeId && e.type === "descended-from")
                ? () => {
                    setCollapsedRoots((current) => {
                      const next = new Set(current);
                      if (next.has(selectedNodeId)) {
                        next.delete(selectedNodeId);
                      } else {
                        next.add(selectedNodeId);
                      }
                      return next;
                    });
                  }
                : undefined
            }
            currentTool={currentTool}
            canManageLinkedUser={canManageNodeLinks}
            inviteFeedback={inviteFeedback}
            invitePending={invitePending}
            linkedUserLoading={nodeLinksLoading && !selectedNodeUserLink}
            linkedUserLabel={selectedNodeUserLink?.label ?? null}
            localStatus={localStatus}
            onDeleteSelection={
              selectedNode || selectedEdge ? deleteCurrentSelection : undefined
            }
            onEdgeLabelChange={(value) => {
              if (!selectedEdgeId) {
                return;
              }

              commitBeforeChange();

              const nextEdges = updateEdgeData(edges, selectedEdgeId, {
                label: value,
              });
              setEdges(nextEdges);
              persistImmediateSnapshot({ nextEdges });
            }}
            onEdgeTypeChange={(value) => {
              if (!selectedEdgeId) {
                return;
              }

              commitBeforeChange();

              const nextEdges = updateEdgeData(edges, selectedEdgeId, {
                relationshipType: value,
              });
              setEdges(nextEdges);
              persistImmediateSnapshot({ nextEdges });
            }}
            onNodeLabelChange={(value) => {
              if (!selectedNodeId) {
                return;
              }

              commitBeforeChange();

              const nextNodes = updateNodeData(nodes, selectedNodeId, {
                label: value,
              });
              setNodes(nextNodes);
              persistImmediateSnapshot({ nextNodes });
            }}
            onNodeNotesChange={(value) => {
              if (!selectedNodeId) {
                return;
              }

              commitBeforeChange();

              const nextNodes = updateNodeData(nodes, selectedNodeId, {
                notes: value,
              });
              setNodes(nextNodes);
              persistImmediateSnapshot({ nextNodes });
            }}
            onNodeSymbolTypeChange={(value) => {
              if (!selectedNodeId) {
                return;
              }

              commitBeforeChange();

              const nextNodes = updateNodeData(nodes, selectedNodeId, {
                symbolType: value,
              });
              setNodes(nextNodes);
              persistImmediateSnapshot({ nextNodes });
            }}
            onNodeUserInvite={
              canInviteNodeLinks && !nodeLinksLoading
                ? handleNodeUserInvite
                : undefined
            }
            onNodeUserUnlink={
              canManageNodeLinks && selectedNodeUserLink
                ? handleNodeUserUnlink
                : undefined
            }
            onTextNodeChange={handleTextNodeChange}
            selectedEdge={selectedEdge}
            selectedNodeDerivedLabel={
              selectedNodeId
                ? (derivedKinshipLabels.labelsByNodeId[selectedNodeId] ?? null)
                : null
            }
            selectedNode={selectedDisplayNode}
          />
        </aside>

        {/* ---- Title panel ----------------------------------------------
           Compact card pinned to the top-left. Holds the back link, chart
           title, and a single-line of status pills. The canvas grid shows
           through everywhere this panel doesn't reach (which is the entire
           middle and right-hand band of the screen on desktop). */}
        <header className="paper-panel kinship-toolbar-panel fixed top-3 left-3 z-40 w-[min(20rem,calc(100vw-1.5rem))] sm:w-auto sm:max-w-[22rem] rounded-[1.2rem] px-3 py-2">
          {/* Plain <a> (not next/link) is intentional. The editor tree is
             heavy (ReactFlow + many effects), so a client-side React commit
             back to the dashboard takes a noticeable amount of time. A
             full-page navigation lets the browser tear down the editor
             natively, shows its loading indicator immediately, and lets the
             existing `beforeunload` listener flush pending autosaves before
             we leave (which the SPA cleanup would otherwise cancel). */}
          <a
            href="/"
            className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-strong sm:text-[11px]"
          >
            Back to dashboard
          </a>
          <input
            type="text"
            value={chartTitle}
            onChange={(e) => {
              setChartTitle(e.target.value);
              persistImmediateSnapshot({ nextTitle: e.target.value });
            }}
            className="font-display mt-0.5 w-full border-0 bg-transparent p-0 text-lg text-ink outline-none transition focus:border-b-2 focus:border-accent sm:text-xl"
            placeholder="Untitled chart"
            aria-label="Chart title"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft sm:text-[11px]">
            <SaveStatusIndicator
              state={saveStatusState}
              onRetry={retryCloudSync}
            />
            <span className="hidden rounded-full bg-white/65 px-2 py-0.5 md:inline">
              {createdAt.slice(0, 10)}
            </span>
            {currentTool && activeTool ? (
              <span className="max-w-[min(20rem,calc(100vw-10rem))] truncate rounded-full bg-white/65 px-2 py-0.5 font-medium text-ink">
                Connecting: {activeTool.name}
              </span>
            ) : null}
          </div>
          <span className="sr-only">{cloudStatus}</span>
        </header>

        {/* ---- Toolbar panel ---------------------------------------------
           Auto-width card. Sits at the top-right on lg+ screens (so it
           doesn't fight the title panel for horizontal space) and falls back
           to a row directly under the title panel on smaller viewports. */}
        <div
          role="toolbar"
          aria-label="Chart toolbar"
          className="paper-panel kinship-toolbar-panel fixed top-[110px] left-3 right-3 z-40 rounded-[1.2rem] px-2 py-1.5 sm:top-[104px] lg:top-3 lg:left-auto lg:right-3 lg:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex flex-wrap items-center justify-center gap-0.5 lg:flex-nowrap lg:justify-end">
            <IconToolbarButton
              title="Hand tool — drag the canvas (left mouse)"
              pressed={canvasTool === "hand"}
              onClick={() => setCanvasTool("hand")}
            >
              <Hand strokeWidth={2} />
            </IconToolbarButton>
            <IconToolbarButton
              title="Pointer tool — marquee select on empty canvas; middle/right drag or Space+drag to pan"
              pressed={canvasTool === "pointer"}
              onClick={() => setCanvasTool("pointer")}
            >
              <MousePointer2 strokeWidth={2} />
            </IconToolbarButton>
            <span
              className="mx-1 hidden h-5 w-px shrink-0 bg-line sm:inline"
              aria-hidden
            />
            <IconToolbarButton
              title="Undo (Ctrl+Z / ⌘Z)"
              disabled={!undoAvailable}
              onClick={undo}
            >
              <Undo2 strokeWidth={2} />
            </IconToolbarButton>
            <IconToolbarButton
              title="Redo (Ctrl+Y / ⌘Y or Ctrl+Shift+Z)"
              disabled={!redoAvailable}
              onClick={redo}
            >
              <Redo2 strokeWidth={2} />
            </IconToolbarButton>
            <span
              className="mx-1 hidden h-5 w-px shrink-0 bg-line sm:inline"
              aria-hidden
            />
            <IconToolbarButton
              title="Copy selection (Ctrl+C / ⌘C)"
              disabled={
                selectedNodeIds.length === 0 && selectedEdgeIds.length === 0
              }
              onClick={copySelection}
            >
              <Copy strokeWidth={2} />
            </IconToolbarButton>
            <IconToolbarButton
              title="Paste (Ctrl+V / ⌘V)"
              disabled={!clipboardReady}
              onClick={() => pasteSelection()}
            >
              <ClipboardPaste strokeWidth={2} />
            </IconToolbarButton>
            <IconToolbarButton
              title="AI — describe your kin network and merge a draft onto the chart"
              onClick={() => setAiGenerateOpen(true)}
            >
              <Sparkles strokeWidth={2} />
            </IconToolbarButton>
            <IconToolbarButton
              title="Duplicate selection (Ctrl+D / ⌘D)"
              onClick={() => {
                if (selectedNodeIds.length > 1 || selectedEdgeIds.length > 0) {
                  duplicateSelection();
                  return;
                }
                if (!selectedNodeId) {
                  return;
                }
                commitBeforeChange();
                const duplicated = duplicateNode(nodes, selectedNodeId);
                setNodes(duplicated.nodes);
                if (duplicated.createdId) {
                  setSelectedNodeIds([duplicated.createdId]);
                } else {
                  setSelectedNodeIds([]);
                }
                setSelectedEdgeIds([]);
              }}
            >
              <CopyPlus strokeWidth={2} />
            </IconToolbarButton>
            <IconToolbarButton
              title="Delete selection (Delete / Backspace)"
              disabled={
                selectedNodeIds.length === 0 && selectedEdgeIds.length === 0
              }
              onClick={deleteCurrentSelection}
            >
              <Trash2 strokeWidth={2} />
            </IconToolbarButton>
            <span
              className="mx-1 hidden h-5 w-px shrink-0 bg-line sm:inline"
              aria-hidden
            />
            <IconToolbarButton
              title="Fit view to content"
              onClick={fitViewToContent}
            >
              <Maximize2 strokeWidth={2} />
            </IconToolbarButton>
            <IconToolbarButton
              title="Default view — ideal zoom for placing symbols"
              onClick={applyIdealViewport}
            >
              <Crosshair strokeWidth={2} />
            </IconToolbarButton>
            <span
              className="mx-1 hidden h-5 w-px shrink-0 bg-line sm:inline"
              aria-hidden
            />
            <IconToolbarButton
              title={
                exporting === "png" ? "Exporting PNG…" : "Export chart as PNG"
              }
              disabled={exporting !== null}
              className={`${
                exporting === "png"
                  ? "animate-pulse"
                  : "!border-accent-strong bg-accent text-white hover:!bg-accent-strong"
              }`}
              onClick={() => void handleExport("png")}
            >
              <ImageDown
                strokeWidth={2}
                className={exporting !== null ? "opacity-60" : ""}
              />
            </IconToolbarButton>
            <IconToolbarButton
              title={
                exporting === "pdf" ? "Exporting PDF…" : "Export chart as PDF"
              }
              disabled={exporting !== null}
              className={exporting === "pdf" ? "animate-pulse" : ""}
              onClick={() => void handleExport("pdf")}
            >
              <FileText strokeWidth={2} />
            </IconToolbarButton>
            {authEnabled ? (
              user ? (
                <IconToolbarButton
                  title="Sync with cloud"
                  onClick={() => void flushThenSync()}
                >
                  <CloudUpload strokeWidth={2} />
                </IconToolbarButton>
              ) : (
                <IconToolbarButton
                  title="Sign in with Google to save this chart to the cloud"
                  onClick={() => void signInWithGoogle(`/charts/${chartId}`)}
                >
                  <CloudUpload strokeWidth={2} />
                </IconToolbarButton>
              )
            ) : null}
          </div>
        </div>

        <AiGeneratePanel
          open={aiGenerateOpen}
          onClose={() => setAiGenerateOpen(false)}
          existingNodes={nodes}
          onApplyMerge={handleAiMerge}
        />

        {mobilePaletteOpen ? (
          <div className="fixed inset-0 z-40 bg-[rgba(24,18,10,0.3)] p-3 lg:hidden">
            <div className="paper-panel mx-auto mt-auto h-[78vh] w-[min(28rem,calc(100vw-1.5rem))] rounded-[1.75rem] p-5">
              <SymbolPalette
                onClose={() => setMobilePaletteOpen(false)}
                activeSymbolType={activeSymbolType}
                onPickSymbol={armSymbolPlacement}
                onStartRelationship={startRelationshipMode}
                currentTool={currentTool}
              />
            </div>
          </div>
        ) : null}

        {mobileInspectorOpen ? (
          <div className="fixed inset-0 z-40 bg-[rgba(24,18,10,0.3)] p-3 lg:hidden">
            <div className="paper-panel mx-auto mt-auto h-[78vh] w-[min(28rem,calc(100vw-1.5rem))] rounded-[1.75rem] p-5">
              <InspectorPanel
                cloudStatus={cloudStatus}
                isNodeCollapsed={
                  selectedNodeId ? collapsedRoots.has(selectedNodeId) : false
                }
                onToggleCollapse={
                  selectedNodeId && edges.some((e) => e.target === selectedNodeId && e.type === "descended-from")
                    ? () => {
                        setCollapsedRoots((current) => {
                          const next = new Set(current);
                          if (next.has(selectedNodeId)) {
                            next.delete(selectedNodeId);
                          } else {
                            next.add(selectedNodeId);
                          }
                          return next;
                        });
                      }
                    : undefined
                }
                currentTool={currentTool}
                canManageLinkedUser={canManageNodeLinks}
                inviteFeedback={inviteFeedback}
                invitePending={invitePending}
                linkedUserLoading={nodeLinksLoading && !selectedNodeUserLink}
                linkedUserLabel={selectedNodeUserLink?.label ?? null}
                localStatus={localStatus}
                onDeleteSelection={
                  selectedNode || selectedEdge
                    ? deleteCurrentSelection
                    : undefined
                }
                onClose={() => setMobileInspectorOpen(false)}
                onEdgeLabelChange={(value) => {
                  if (!selectedEdgeId) {
                    return;
                  }

                  commitBeforeChange();

                  const nextEdges = updateEdgeData(edges, selectedEdgeId, {
                    label: value,
                  });
                  setEdges(nextEdges);
                  persistImmediateSnapshot({ nextEdges });
                }}
                onEdgeTypeChange={(value) => {
                  if (!selectedEdgeId) {
                    return;
                  }

                  commitBeforeChange();

                  const nextEdges = updateEdgeData(edges, selectedEdgeId, {
                    relationshipType: value,
                  });
                  setEdges(nextEdges);
                  persistImmediateSnapshot({ nextEdges });
                }}
                onNodeLabelChange={(value) => {
                  if (!selectedNodeId) {
                    return;
                  }

                  commitBeforeChange();

                  const nextNodes = updateNodeData(nodes, selectedNodeId, {
                    label: value,
                  });
                  setNodes(nextNodes);
                  persistImmediateSnapshot({ nextNodes });
                }}
                onNodeNotesChange={(value) => {
                  if (!selectedNodeId) {
                    return;
                  }

                  commitBeforeChange();

                  const nextNodes = updateNodeData(nodes, selectedNodeId, {
                    notes: value,
                  });
                  setNodes(nextNodes);
                  persistImmediateSnapshot({ nextNodes });
                }}
                onNodeSymbolTypeChange={(value) => {
                  if (!selectedNodeId) {
                    return;
                  }

                  commitBeforeChange();

                  const nextNodes = updateNodeData(nodes, selectedNodeId, {
                    symbolType: value,
                  });
                  setNodes(nextNodes);
                  persistImmediateSnapshot({ nextNodes });
                }}
                onNodeUserInvite={
                  canInviteNodeLinks && !nodeLinksLoading
                    ? handleNodeUserInvite
                    : undefined
                }
                onNodeUserUnlink={
                  canManageNodeLinks && selectedNodeUserLink
                    ? handleNodeUserUnlink
                    : undefined
                }
                onTextNodeChange={handleTextNodeChange}
                selectedEdge={selectedEdge}
                selectedNodeDerivedLabel={
                  selectedNodeId
                    ? (derivedKinshipLabels.labelsByNodeId[selectedNodeId] ??
                      null)
                    : null
                }
                selectedNode={selectedDisplayNode}
              />
            </div>
          </div>
        ) : null}
      </main>
    </KinshipEditorProvider>
  );
}
