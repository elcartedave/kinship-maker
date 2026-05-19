"use client";

import Link from "next/link";
import Image from 'next/image';
import logoImg from "../../images/kinnect_logo.png";
import { useRouter } from "next/navigation";
import {
  useCallback,
  startTransition,
  useEffect,
  useMemo,
  useState,
} from "react";

import { InstallButton } from "@/components/pwa/install-button";
import { InstallButtonBig } from "../pwa/install-button-big";
import { useAppShell } from "@/components/providers/app-shell";
import { APP_NAME } from "@/lib/kinship/constants";
import {
  createChartRecord,
  createEmptyChartDocument,
  createKinshipNode,
} from "@/lib/kinship/document";
import {
  createChartFromDocument,
  listCharts,
  purgeChart,
  remoteChartToLocal,
  saveChartRecord,
} from "@/lib/kinship/local-store";
import { createSampleChartDocument } from "@/lib/kinship/sample-chart";
import { isEgoSymbolType, isSymbolNode } from "@/lib/kinship/symbols";
import type { ChartDocument, ChartRecord } from "@/lib/kinship/types";
import { createBilateralChartDocument } from "@/lib/kinship/bilateral-chart";
import { createMatrilinealChartDocument } from "@/lib/kinship/matrilineal-chart";
import { createPatrilinealChartDocument } from "@/lib/kinship/patrilineal-chart";

type TemplateType = "patrilineal" | "matrilineal" | "bilateral";

const CHART_TEMPLATES: { type: TemplateType; label: string }[] = [
  { type: "patrilineal", label: "Patrilineal Chart" },
  { type: "matrilineal", label: "Matrilineal Chart" },
  { type: "bilateral", label: "Bilateral Chart" },
];

function chartDocumentForTemplate(type: TemplateType): ChartDocument {
  switch (type) {
    case "patrilineal":
      return createPatrilinealChartDocument();
    case "matrilineal":
      return createMatrilinealChartDocument();
    case "bilateral":
      return createBilateralChartDocument();
  }
}

type PendingInvitation = {
  id: string;
  chart_id: string;
  node_id: string;
  inviter_id: string;
  created_at: string;
  chartTitle: string;
  inviterLabel: string;
};

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type SexAssignedAtBirth = "female" | "male" | null;

function egoSymbolTypeForSex(sexAssignedAtBirth: SexAssignedAtBirth) {
  return sexAssignedAtBirth === "female" ? "female-ego" : "male-ego";
}

function applyEgoSymbolType(
  document: ChartDocument,
  symbolType: "female-ego" | "male-ego",
) {
  const nodes = document.nodes.map((node) => {
    if (!isSymbolNode(node) || !isEgoSymbolType(node.data.symbolType)) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        symbolType,
      },
    };
  });

  return {
    ...document,
    nodes,
  };
}

function createOwnedBlankChartDocument(sexAssignedAtBirth: SexAssignedAtBirth) {
  const document = createEmptyChartDocument("Untitled chart");
  const symbolType = egoSymbolTypeForSex(sexAssignedAtBirth);
  const egoNode = createKinshipNode({
    id: crypto.randomUUID(),
    symbolType,
    label: "Ego",
    x: 0,
    y: 0,
  });

  return {
    document: {
      ...document,
      nodes: [egoNode],
    },
    egoNodeId: egoNode.id,
  };
}

function getEgoNodeId(document: ChartDocument) {
  return (
    document.nodes.find(
      (node) => isSymbolNode(node) && isEgoSymbolType(node.data.symbolType),
    )?.id ?? null
  );
}

export function DashboardPage() {
  const router = useRouter();
  const {
    authEnabled,
    lastSync,
    loadingAuth,
    signInWithGoogle,
    signOut,
    supabase,
    syncError,
    syncNow,
    user,
  } = useAppShell();
  const [charts, setCharts] = useState<ChartRecord[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingInvitation[]
  >([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [sexAssignedAtBirth, setSexAssignedAtBirth] =
    useState<SexAssignedAtBirth>(null);
  const sortedCharts = [...charts].sort((a, b) => {
    const dateA = new Date(a.updatedAt).getTime();
    const dateB = new Date(b.updatedAt).getTime();
    return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
  });
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const loadCharts = useCallback(async () => {
    if (!authEnabled) {
      const items = await listCharts();
      startTransition(() => setCharts(items.filter((c) => !c.deleted)));
      return;
    }

    if (!user) {
      startTransition(() => setCharts([]));
      return;
    }

    const items = await listCharts();
    const accessible = items.filter(
      (c) =>
        !c.deleted && (c.ownerId === user.id || c.memberIds?.includes(user.id)),
    );

    if (!supabase || accessible.length === 0) {
      startTransition(() => setCharts(accessible));
      return;
    }

    const { data: memberships } = await supabase
      .from("chart_members")
      .select("chart_id, user_id")
      .in(
        "chart_id",
        accessible.map((chart) => chart.id),
      );

    const memberIdsByChart = new Map<string, string[]>();
    for (const membership of memberships ?? []) {
      const current = memberIdsByChart.get(membership.chart_id) ?? [];
      current.push(membership.user_id);
      memberIdsByChart.set(membership.chart_id, current);
    }

    startTransition(() =>
      setCharts(
        accessible.map((chart) => ({
          ...chart,
          memberIds: memberIdsByChart.get(chart.id) ?? chart.memberIds,
        })),
      ),
    );
  }, [authEnabled, supabase, user]);

  const loadPendingInvitations = useCallback(async () => {
    if (!authEnabled || !user || !supabase) {
      startTransition(() => setPendingInvitations([]));
      return;
    }

    const { data, error } = await supabase
      .from("kinship_node_invitations")
      .select("id, chart_id, node_id, inviter_id, created_at")
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return;
    }

    const inviterIds = Array.from(new Set(data.map((item) => item.inviter_id)));
    const { data: inviterRows } = inviterIds.length
      ? await supabase
          .from("users")
          .select("id, email, name, nickname")
          .in("id", inviterIds)
      : { data: [] };
    const inviterLabels = new Map(
      (inviterRows ?? []).map((profile) => [
        profile.id,
        profile.nickname ?? profile.name ?? profile.email ?? "Someone",
      ]),
    );

    startTransition(() =>
      setPendingInvitations(
        data.map((item) => ({
          id: item.id,
          chart_id: item.chart_id,
          node_id: item.node_id,
          inviter_id: item.inviter_id,
          created_at: item.created_at,
          chartTitle: "a kinship chart",
          inviterLabel: inviterLabels.get(item.inviter_id) ?? "Someone",
        })),
      ),
    );
  }, [authEnabled, supabase, user]);

  useEffect(() => {
    void loadCharts();
  }, [loadCharts, lastSync]);

  useEffect(() => {
    void loadPendingInvitations();
  }, [loadPendingInvitations, lastSync]);

  useEffect(() => {
    if (!authEnabled || !user || !supabase) {
      setSexAssignedAtBirth(null);
      return;
    }

    void supabase
      .from("users")
      .select("sex_assigned_at_birth")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.sex_assigned_at_birth;
        setSexAssignedAtBirth(
          value === "female" || value === "male" ? value : null,
        );
      });
  }, [authEnabled, supabase, user]);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const cloudLabel = useMemo(() => {
    if (!authEnabled) {
      return "Cloud sync is ready once Supabase is configured.";
    }

    if (loadingAuth) {
      return "Checking cloud session...";
    }

    if (user) {
      return online
        ? "Signed in. Charts are stored in your account and cached on this device for fast editing."
        : "Offline. Edits stay on this device and sync when you are back online.";
    }

    return "Sign in with Google to create, open, and delete your private charts.";
  }, [authEnabled, loadingAuth, online, user]);

  async function deleteOwnedChartFromCloud(id: string) {
    if (!supabase || !user) {
      return null;
    }

    const { error: membersError } = await supabase
      .from("chart_members")
      .select("user_id")
      .eq("chart_id", id);

    if (membersError) {
      return membersError.message;
    }

    const { error: rpcError } = await supabase.rpc("delete_owned_chart", {
      target_chart_id: id,
    });

    if (!rpcError) {
      return null;
    }

    const rpcMissing =
      rpcError.code === "42883" ||
      rpcError.code === "PGRST202" ||
      rpcError.message.toLowerCase().includes("delete_owned_chart");

    if (!rpcMissing) {
      return rpcError.message;
    }

    const { data, error: deleteError } = await supabase
      .from("charts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      return deleteError.message;
    }

    if (!data) {
      return "Supabase did not delete the chart. Re-run supabase/collaboration.sql and try again.";
    }

    return null;
  }

  async function handleCreateChart() {
    setFeedback(null);

    if (!authEnabled) {
      setBusyAction("new");
      const record = createChartRecord("Untitled chart");
      await saveChartRecord(record);
      router.push(`/charts/${record.id}`);
      setBusyAction(null);
      return;
    }

    if (!user || !supabase) {
      setFeedback("Sign in with Google to create a chart.");
      return;
    }

    setBusyAction("new");
    const id = crypto.randomUUID();
    const { document, egoNodeId } =
      createOwnedBlankChartDocument(sexAssignedAtBirth);
    const { data, error } = await supabase
      .from("charts")
      .insert({
        id,
        user_id: user.id,
        title: document.meta.title,
        document,
        updated_at: document.meta.updatedAt,
      })
      .select("id, user_id, title, document, updated_at")
      .single();

    if (error || !data) {
      setFeedback(error?.message ?? "Could not create chart in the cloud.");
      setBusyAction(null);
      return;
    }

    await Promise.all([
      supabase
        .from("chart_members")
        .update({ ego_node_id: egoNodeId })
        .eq("chart_id", id)
        .eq("user_id", user.id),
      supabase.from("kinship_node_user_links").insert({
        chart_id: id,
        node_id: egoNodeId,
        user_id: user.id,
      }),
    ]);

    await saveChartRecord(
      remoteChartToLocal(data, user.id, { ego_node_id: egoNodeId }),
    );
    await loadCharts();
    router.push(`/charts/${id}`);
    setBusyAction(null);
  }

  async function handleCreateSample() {
    setFeedback(null);

    if (!authEnabled) {
      setBusyAction("sample");
      const document = createSampleChartDocument();
      const record = await createChartFromDocument(
        document.meta.title,
        document,
      );
      router.push(`/charts/${record.id}`);
      setBusyAction(null);
      return;
    }

    if (!user || !supabase) {
      setFeedback("Sign in with Google to load the sample chart.");
      return;
    }

    setBusyAction("sample");
    const document = applyEgoSymbolType(
      createSampleChartDocument(),
      egoSymbolTypeForSex(sexAssignedAtBirth),
    );
    const egoNodeId = getEgoNodeId(document);
    const id = crypto.randomUUID();
    const { data, error } = await supabase
      .from("charts")
      .insert({
        id,
        user_id: user.id,
        title: document.meta.title,
        document,
        updated_at: document.meta.updatedAt,
      })
      .select("id, user_id, title, document, updated_at")
      .single();

    if (error || !data) {
      setFeedback(error?.message ?? "Could not create sample chart.");
      setBusyAction(null);
      return;
    }

    if (egoNodeId) {
      await Promise.all([
        supabase
          .from("chart_members")
          .update({ ego_node_id: egoNodeId })
          .eq("chart_id", id)
          .eq("user_id", user.id),
        supabase.from("kinship_node_user_links").insert({
          chart_id: id,
          node_id: egoNodeId,
          user_id: user.id,
        }),
      ]);
    }

    await saveChartRecord(
      remoteChartToLocal(
        data,
        user.id,
        egoNodeId ? { ego_node_id: egoNodeId } : undefined,
      ),
    );
    await loadCharts();
    router.push(`/charts/${id}`);
    setBusyAction(null);
  }

  async function handleCreateFromTemplate(type: TemplateType) {
    setFeedback(null);
    
    if (!authEnabled) {
      setBusyAction(type);
      const document = chartDocumentForTemplate(type);
      const record = await createChartFromDocument(
        document.meta.title,
        document,
      );
      router.push(`/charts/${record.id}`);
      setBusyAction(null);
      return;
    }

    if (!user || !supabase) {
      setFeedback("Sign in with Google to create a chart from this template.");
      return;
    }

    setBusyAction(type);
    const document = chartDocumentForTemplate(type);
    const egoNodeId = getEgoNodeId(document);
    const id = crypto.randomUUID();
    const { data, error } = await supabase
      .from("charts")
      .insert({
        id,
        user_id: user.id,
        title: document.meta.title,
        document,
        updated_at: document.meta.updatedAt,
      })
      .select("id, user_id, title, document, updated_at")
      .single();

    if (error || !data) {
      setFeedback(error?.message ?? "Could not create chart from template.");
      setBusyAction(null);
      return;
    }

    if (egoNodeId) {
      await Promise.all([
        supabase
          .from("chart_members")
          .update({ ego_node_id: egoNodeId })
          .eq("chart_id", id)
          .eq("user_id", user.id),
        supabase.from("kinship_node_user_links").insert({
          chart_id: id,
          node_id: egoNodeId,
          user_id: user.id,
        }),
      ]);
    }

    await saveChartRecord(
      remoteChartToLocal(
        data,
        user.id,
        egoNodeId ? { ego_node_id: egoNodeId } : undefined,
      ),
    );
    await loadCharts();
    router.push(`/charts/${id}`);
    setBusyAction(null);
  }

  
  

  async function handleDelete(id: string) {
    if (authEnabled && (!user || !supabase)) {
      return;
    }

    const chart = charts.find((item) => item.id === id);
    if (authEnabled && user && (!chart || chart.ownerId !== user.id)) {
      setFeedback("Only the chart owner can delete this chart.");
      return;
    }

    setBusyAction(id);
    setFeedback(null);

    if (authEnabled && user && supabase) {
      const deleteError = await deleteOwnedChartFromCloud(id);

      if (deleteError) {
        setFeedback(deleteError);
        setBusyAction(null);
        return;
      }
    }

    await purgeChart(id);
    await loadCharts();
    setDeleteCandidateId(null);
    setBusyAction(null);
  }

  async function handleGoogleSignIn() {
    setFeedback(null);
    setBusyAction("auth");
    const error = await signInWithGoogle("/");
    if (error) {
      setBusyAction(null);
      setFeedback(error);
      return;
    }
  }

  async function handleInvitation(id: string, action: "approve" | "reject") {
    if (!supabase) {
      return;
    }

    setFeedback(null);
    setBusyAction(id);
    const { error } = await supabase.rpc(
      action === "approve"
        ? "approve_kinship_node_invitation"
        : "reject_kinship_node_invitation",
      { invitation_id: id },
    );

    if (error) {
      setFeedback(error.message);
      setBusyAction(null);
      return;
    }

    await syncNow();
    await loadPendingInvitations();
    await loadCharts();
    setBusyAction(null);
  }

  return (
    <main>
      
    <nav id="navbar" className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 md:px-40 py-4 md:py-5 bg-cream/85 backdrop-blur-md border-b border-gold/15 transition-all duration-300">
      
      {/* Logo Block (Image + Text linked together) */}
      <a href="#" className="flex items-center gap-2.5 no-underline text-ink">
        <Image 
          src={logoImg}
          alt="Kinnect Logo" 
          width={35} 
          className="object-contain" 
        />
        <span className="font-sans text-xl tracking-tight">
          <span className="font-extrabold">Kin</span>
          <span className="font-light">nect</span>
        </span>
      </a>

      {/* Navigation Links */}
      {authEnabled &&
        (user ? (
          <div className="flex text-sm items-center gap-6">
            <p className="text-sm font-semibold text-ink">{user.email}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void syncNow().then(() => {
                    void loadCharts();
                  })
                }
                  className="px-[22px] py-2.5 rounded-lg bg-gold text-ink text-sm font-medium cursor-pointer border border-transparent tracking-wide transition-all duration-250 no-underline inline-block hover:bg-cream hover:border-gold/15"
                >
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="px-[22px] py-2.5 rounded-lg bg-ink text-cream text-sm font-medium cursor-pointer border-none tracking-wide transition-all duration-250 no-underline inline-block hover:bg-gold hover:text-ink"
                >
                  Sign out
                </button>
            </div>
          </div>
        ) : (
          <ul className="hidden md:flex gap-8 list-none m-0 p-0">
            <li>
              <a href="#features" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">
                Features
              </a>
            </li>
            <li>
              <a href="#how" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">
                How It Works
              </a>
            </li>
            <li>
              <a href="#team" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">
                Developers
              </a>
            </li>
          </ul>
        ))
      }
    </nav>

    {(!authEnabled || user) ? (
      <section className="min-h-screen bg-cream relative overflow-hidden selection:bg-gold/20 px-6 md:px-40 pt-[100px] md:pt-[120px] pb-[60px] md:pb-20">

        {/* HERO / WELCOME BANNER */}
        <div className="border-b border-warm">
          <div className="relative z-10 mx-auto flex max-w-[1600px] flex-col justify-between gap-12 py-14 lg:flex-row lg:items-center">
            {/* Left Side: Copy */}
            <div className="max-w-[620px]">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gold/12 border border-gold/30 text-s font-semibold text-gold tracking-[0.08em] uppercase mb-6">
                CONNECT YOUR KIN WITH KINNECT
              </div>

              <h1 className="font-serif text-[clamp(42px,5vw,72px)] font-black leading-[1.05] tracking-[-0.02em] mb-6">
                Welcome back, <em className="italic text-gold font-semibold">{user?.email?.split("@")[0] ?? "Researcher"}</em>
              </h1>

              <p className="mt-6 max-w-[500px] text-lg md:text-[20px] leading-relaxed text-slate">
                Continue building family diagrams, organizing generations,
                and collaborating seamlessly across devices.
              </p>
            </div>

            {/* Container layout targeting 2 columns */}

            {/* Container layout utilizing a 6-column grid for perfect row division math */}
<div className="grid grid-cols-6 gap-3 max-w-xl w-full">
  
  {/* ========================================================= */}
  {/* ROW 1: 2 BUTTONS PER ROW (Each spans 3 of the 6 columns) */}
  {/* ========================================================= */}

  {/* CREATE NEW CHART */}
  <button
    type="button"
    onClick={() => void handleCreateChart()}
    disabled={busyAction === "new"}
    className="col-span-3 group flex h-[112px] w-full flex-col items-center justify-center rounded-[16px] bg-ink text-cream border-none transition-all duration-300 hover:-translate-y-1 hover:bg-gold hover:text-ink shadow-[0_3px_14px_rgba(15,14,13,.14)] hover:shadow-[0_6px_22px_rgba(201,147,58,.18)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
  >
    <div className="mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cream/30 text-[28px] font-light transition-colors group-hover:border-ink/30">
      +
    </div>
    <span className="text-[14px] font-bold tracking-tight text-center px-1 h-[20px] flex items-center justify-center">
      {busyAction === "new" ? "Creating..." : "Create New Chart"}
    </span>
  </button>

  {/* LOAD SAMPLE */}
  <button
    type="button"
    onClick={() => void handleCreateSample()}
    disabled={busyAction === "sample"}
    className="col-span-3 group flex h-[112px] w-full flex-col items-center justify-center rounded-[16px] border-[1.5px] border-warm bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold hover:shadow-[0_4px_16px_rgba(0,0,0,.07)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
  >
    <div className="mb-2 flex h-9 w-9 shrink-0 items-center justify-center">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="text-gold transition-transform group-hover:scale-105"
      >
        <path d="M3 7h18v10H3z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 7V3h10v4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 12h8" strokeLinecap="round" />
        <path d="M12 8v8" strokeLinecap="round" />
      </svg>
    </div>
    <span className="text-[14px] font-bold tracking-tight text-center px-1 h-[20px] flex items-center justify-center">
      {busyAction === "sample" ? "Loading..." : "Load Sample Chart"}
    </span>
  </button>

  {/* ========================================================= */}
  {/* ROW 2: 3 BUTTONS PER ROW (Each spans 2 of the 6 columns) */}
  {/* ========================================================= */}

  {/* CHART TEMPLATES (Bilateral, Patrilineal, Matrilineal) */}
  {CHART_TEMPLATES.map(({ type, label }) => (
    <button
      key={type}
      type="button"
      onClick={() => void handleCreateFromTemplate(type)}
      disabled={busyAction === type}
      className="col-span-2 group flex h-[112px] w-full flex-col items-center justify-center rounded-[16px] border-[1.5px] border-warm bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold hover:shadow-[0_4px_16px_rgba(0,0,0,.07)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
    >
      <div className="mb-2 flex h-9 w-9 shrink-0 items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="text-gold transition-transform group-hover:scale-105"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <span className="text-[14px] font-bold tracking-tight text-center px-1 h-[20px] flex items-center justify-center">
        {busyAction === type ? "Creating..." : label}
      </span>
    </button>
  ))}

</div>

          </div>
        </div>

        {/* MAIN CONTENT WORKSPACE AREA */}
        <div className="max-w-[1300px] mx-auto py-16">

          {/* WORKSPACE HEADER */}
          <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
                RECENT CHARTS
              </p>
              <h4 className="mt-1 font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
                Pick up where you left off
              </h4>
              <p className="text-sm text-slate font-medium mt-3">
                {charts.length} {charts.length === 1 ? "chart" : "charts"} available
              </p>
            </div>

            {/* VIEW TOGGLES & SORT */}
            {charts.length > 0 && (
              <div className="flex items-center gap-3 select-none shrink-0 self-end sm:self-auto">

                <button
                  type="button"
                  onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
                  className="flex h-10 items-center gap-2 rounded-xl border border-warm bg-white px-3.5 text-xs font-bold text-ink shadow-[0_2px_12px_rgba(0,0,0,.06)] transition-all duration-200 hover:border-mist hover:shadow-[0_4px_24px_rgba(0,0,0,.12)]"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform duration-300 ${sortOrder === "asc" ? "rotate-180" : ""}`}
                  >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <polyline points="19 12 12 19 5 12"></polyline>
                  </svg>
                  <span>Date {sortOrder === "desc" ? "Newest" : "Oldest"}</span>
                </button>

                <div className="h-5 w-[1px] bg-ink/10 my-auto mx-1" />

                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                  className={`flex h-10 w-14 items-center justify-center rounded-xl border transition-all duration-200 ${
                    viewMode === "grid"
                      ? "border-warm bg-white text-ink shadow-[0_2px_12px_rgba(0,0,0,.06)]"
                      : "border-transparent bg-ink/[0.03] text-ink/40 hover:text-ink hover:bg-ink/[0.06]"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="List view"
                  className={`flex h-10 w-14 items-center justify-center rounded-xl border transition-all duration-200 ${
                    viewMode === "list"
                      ? "border-warm bg-white text-ink shadow-[0_2px_12px_rgba(0,0,0,.06)]"
                      : "border-transparent bg-ink/[0.03] text-ink/40 hover:text-ink hover:bg-ink/[0.06]"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {charts.length === 0 ? (
            /* EMPTY STATE */
            <div className="rounded-[24px] border border-dashed border-warm bg-white p-12 md:p-20 text-center shadow-[0_4px_24px_rgba(15,14,13,0.02)]">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cream text-gold">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h3 className="font-serif text-[clamp(24px,3vw,32px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
                Your workspace is empty
              </h3>
              <p className="mx-auto mt-3 max-w-md text-[17px] leading-[1.65] text-slate">
                Create a clean chart or load a predefined archetype template to begin tracking your lineage trees.
              </p>
            </div>
          ) : (
            <div>
              {viewMode === "grid" ? (
                /* GRID VIEW */
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {sortedCharts.map((chart) => {
                    const isDeleting = busyAction === chart.id;
                    return (
                      <article
                        key={chart.id}
                        className="group flex flex-col justify-between rounded-2xl border border-warm bg-white p-6 shadow-[0_4px_24px_rgba(15,14,13,0.02)] transition-all duration-300 hover:-translate-y-1 hover:border-gold/30 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)]"
                      >
                        <div>
                          {/* SVG Thumbnail */}
                          <div className="mb-4 rounded-xl bg-cream p-4 border border-warm relative overflow-hidden">
                            <svg viewBox="0 0 240 100" className="h-24 w-full">
                              <circle cx="50" cy="30" r="10" fill="#c9933a" />
                              <circle cx="120" cy="30" r="10" fill="#5a7a6a" />
                              <circle cx="190" cy="30" r="10" fill="#b85c38" />
                              <line x1="50" y1="30" x2="120" y2="30" stroke="#b0a290" strokeWidth="1.5" />
                              <line x1="120" y1="30" x2="190" y2="30" stroke="#b0a290" strokeWidth="1.5" />
                              <circle cx="120" cy="75" r="10" fill="#0f0e0d" />
                              <line x1="120" y1="40" x2="120" y2="65" stroke="#b0a290" strokeWidth="1.5" />
                            </svg>
                          </div>

                          <Link
                            href={`/charts/${chart.id}`}
                            className="block font-serif text-[22px] font-bold tracking-tight text-ink hover:text-gold transition-colors"
                          >
                            {chart.title}
                          </Link>

                          <p className="mt-1.5 text-xs text-slate font-medium">
                            Modified {formatUpdatedAt(chart.updatedAt)}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="rounded-full bg-[#eef0e5] px-3 py-1 text-xs font-bold text-[#5f6d53]">
                              {authEnabled ? "Your Chart" : chart.ownerId ? "Cloud-Ready" : "Local"}
                            </span>
                            {chart.dirty && (
                              <span className="rounded-full bg-[#fff3d8] px-3 py-1 text-xs font-bold text-[#b8860b] animate-pulse">
                                Pending save
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-6 flex items-center gap-3 border-t border-warm pt-4">
                          <Link
                            href={`/charts/${chart.id}`}
                            className="flex-1 h-[46px] flex items-center justify-center rounded-[10px] bg-ink text-cream text-xs font-semibold transition-all duration-300 hover:bg-gold hover:text-ink hover:-translate-y-0.5"
                          >
                            <span className="text-white">Open Editor</span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => void handleDelete(chart.id)}
                            disabled={isDeleting}
                            aria-label="Delete chart"
                            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] border border-warm bg-white text-slate transition-all hover:border-rust hover:bg-rust/5 hover:text-rust disabled:opacity-40"
                          >
                            {isDeleting ? (
                              <svg className="animate-spin h-5 w-5 text-rust" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                /* LIST VIEW */
                <div className="flex flex-col gap-3">
                  {sortedCharts.map((chart) => {
                    const isDeleting = busyAction === chart.id;
                    return (
                      <article
                        key={chart.id}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-warm bg-white p-4 shadow-[0_4px_24px_rgba(15,14,13,0.02)] transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/30 hover:shadow-[0_8px_24px_rgba(0,0,0,.06)]"
                      >
                        {/* Left */}
                        <div className="flex items-center gap-4">
                          <div className="hidden sm:flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-cream border border-warm overflow-hidden">
                            <svg viewBox="0 0 240 100" className="h-8 w-full opacity-80">
                              <circle cx="50" cy="50" r="14" fill="#c9933a" />
                              <circle cx="120" cy="50" r="14" fill="#5a7a6a" />
                              <circle cx="190" cy="50" r="14" fill="#b85c38" />
                              <line x1="50" y1="50" x2="190" y2="50" stroke="#b0a290" strokeWidth="3" />
                            </svg>
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2.5">
                              <Link
                                href={`/charts/${chart.id}`}
                                className="font-serif text-[20px] font-bold tracking-tight text-ink hover:text-gold transition-colors"
                              >
                                {chart.title}
                              </Link>
                              <span className="rounded-full bg-[#eef0e5] px-2.5 py-0.5 text-[11px] font-bold text-[#5f6d53]">
                                {authEnabled ? "Your Chart" : chart.ownerId ? "Cloud-Ready" : "Local"}
                              </span>
                              {chart.dirty && (
                                <span className="rounded-full bg-[#fff3d8] px-2.5 py-0.5 text-[11px] font-bold text-[#b8860b] animate-pulse">
                                  Pending save
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate font-medium mt-0.5">
                              Modified {formatUpdatedAt(chart.updatedAt)}
                            </p>
                          </div>
                        </div>

                        {/* Right */}
                        <div className="mt-4 sm:mt-0 flex items-center gap-2 sm:w-auto w-full">
                          <Link
                            href={`/charts/${chart.id}`}
                            className="flex-1 h-[46px] flex items-center justify-center rounded-[10px] bg-ink text-cream text-xs font-semibold transition-all duration-300 hover:bg-gold hover:text-ink hover:-translate-y-0.5 px-5"
                          >
                            <span className="text-white">Open Editor</span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => void handleDelete(chart.id)}
                            disabled={isDeleting}
                            aria-label="Delete chart"
                            className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] border border-warm bg-white text-slate transition-all hover:border-rust hover:bg-rust/5 hover:text-rust disabled:opacity-40"
                          >
                            {isDeleting ? (
                              <svg className="animate-spin h-4 w-4 text-rust" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    ) : (
      <>
        <section className="bg-cream min-h-screen grid grid-cols-1 md:grid-cols-2 items-center px-6 md:px-40 pt-[100px] md:pt-[120px] pb-[60px] md:pb-20 gap-6 md:gap-12 relative overflow-hidden">

          <div className="relative z-10">
            <h1 className="font-serif text-[clamp(42px,5vw,72px)] font-black leading-[1.05] tracking-[-0.02em] mb-6">Connect your kin with <em className="italic text-gold font-semibold">Kinnect</em></h1>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gold/12 border border-gold/30 text-s font-semibold text-gold tracking-[0.08em] uppercase mb-6">
              A SMART, AI-POWERED KINSHIP MAPPER
            </div>
            <p className="text-lg leading-[1.65] text-slate max-w-[480px] mb-10">Drag, connect, and map relationships on an infinite canvas. Autosave locally and export your chart exactly as you built it.</p>

            <div>
              <div className="flex gap-4 items-center flex-wrap">
                <InstallButton className="inline-flex text-cream cursor-pointer items-center justify-center gap-2.5 px-7 py-[15px] rounded-[10px] bg-ink font-sans text-[15px] font-semibold transition-all duration-300 shadow-[0_4px_20px_rgba(15,14,13,.2)] hover:bg-gold hover:text-ink hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(201,147,58,.3)]"/>
                <button 
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={busyAction === "auth"}
                className="flex items-center gap-2.5 px-6 py-[14px] rounded-[10px] bg-white text-ink font-sans text-[15px] font-medium cursor-pointer border-[1.5px] border-warm transition-all duration-250 no-underline shadow-[0_2px_12px_rgba(0,0,0,.06)] hover:border-mist hover:shadow-[0_4px_24px_rgba(0,0,0,.12)] hover:-translate-y-0.5">
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  {busyAction === "auth"
                    ? "Redirecting to Google…"
                    : "Continue with Google"}
                </button>
              </div>
              <p className="mt-2.5 text-xs text-[#8a8a8a] flex items-center gap-[5px]">
                <svg className="shrink-0" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#aaa" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Google login is only used for cloud syncing & sharing — never for ads or tracking.
              </p>
            </div>
          </div>

          <div className="relative hidden md:flex justify-center items-center z-10">
            <div className="bg-white border border-warm rounded-[20px] p-8 shadow-[0_24px_80px_rgba(0,0,0,.1),0_4px_16px_rgba(0,0,0,.06)] w-full max-w-[480px] relative animate-float">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-warm">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
                <span className="mx-auto text-xs font-semibold text-[#aaa] tracking-[0.06em]">Family Diagram · Draft</span>
              </div>
              <svg className="w-full" viewBox="0 0 380 280" xmlns="http://www.w3.org/2000/svg">
                <rect x="30" y="20" width="80" height="48" rx="10" fill="#0f0e0d" opacity=".9"/>
                <text x="70" y="40" textAnchor="middle" fill="#f7f4ef" fontSize="10" fontFamily="DM Sans" fontWeight="600">David M.</text>
                <text x="70" y="54" textAnchor="middle" fill="#c9933a" fontSize="9" fontFamily="DM Sans">Grandfather</text>
                <rect x="130" y="20" width="80" height="48" rx="10" fill="#0f0e0d" opacity=".9"/>
                <text x="170" y="40" textAnchor="middle" fill="#f7f4ef" fontSize="10" fontFamily="DM Sans" fontWeight="600">Rose M.</text>
                <text x="170" y="54" textAnchor="middle" fill="#c9933a" fontSize="9" fontFamily="DM Sans">Grandmother</text>
                <line x1="110" y1="44" x2="130" y2="44" stroke="#c9933a" strokeWidth="2"/>
                <circle cx="120" cy="44" r="4" fill="#c9933a"/>
                <line x1="120" y1="68" x2="120" y2="90" stroke="#ddd" strokeWidth="1.5" strokeDasharray="4,3"/>
                <rect x="50" y="90" width="80" height="48" rx="10" fill="#5a7a6a"/>
                <text x="90" y="110" textAnchor="middle" fill="#fff" fontSize="10" fontFamily="DM Sans" fontWeight="600">James M.</text>
                <text x="90" y="124" textAnchor="middle" fill="rgba(255,255,255,.7)" fontSize="9" fontFamily="DM Sans">Father</text>
                <rect x="155" y="90" width="80" height="48" rx="10" fill="#5a7a6a"/>
                <text x="195" y="110" textAnchor="middle" fill="#fff" fontSize="10" fontFamily="DM Sans" fontWeight="600">Laura K.</text>
                <text x="195" y="124" textAnchor="middle" fill="rgba(255,255,255,.7)" fontSize="9" fontFamily="DM Sans">Mother</text>
                <rect x="265" y="90" width="80" height="48" rx="10" fill="#3d4f5c"/>
                <text x="305" y="110" textAnchor="middle" fill="#fff" fontSize="10" fontFamily="DM Sans" fontWeight="600">Mark T.</text>
                <text x="305" y="124" textAnchor="middle" fill="rgba(255,255,255,.7)" fontSize="9" fontFamily="DM Sans">Uncle</text>
                <line x1="130" y1="114" x2="155" y2="114" stroke="#c9933a" strokeWidth="2"/>
                <circle cx="142" cy="114" r="4" fill="#c9933a"/>
                <line x1="142" y1="138" x2="142" y2="170" stroke="#ddd" strokeWidth="1.5" strokeDasharray="4,3"/>
                <rect x="60" y="170" width="80" height="48" rx="10" fill="#b85c38"/>
                <text x="100" y="190" textAnchor="middle" fill="#fff" fontSize="10" fontFamily="DM Sans" fontWeight="600">Alex M.</text>
                <text x="100" y="204" textAnchor="middle" fill="rgba(255,255,255,.7)" fontSize="9" fontFamily="DM Sans">Subject</text>
                <rect x="57" y="167" width="86" height="54" rx="12" fill="none" stroke="#c9933a" strokeWidth="2" opacity=".6"/>
                <rect x="165" y="170" width="80" height="48" rx="10" fill="#7c6b5a"/>
                <text x="205" y="190" textAnchor="middle" fill="#fff" fontSize="10" fontFamily="DM Sans" fontWeight="600">Nina M.</text>
                <text x="205" y="204" textAnchor="middle" fill="rgba(255,255,255,.7)" fontSize="9" fontFamily="DM Sans">Sister</text>
                <rect x="260" y="170" width="80" height="48" rx="10" fill="#7c6b5a"/>
                <text x="300" y="190" textAnchor="middle" fill="#fff" fontSize="10" fontFamily="DM Sans" fontWeight="600">Tom M.</text>
                <text x="300" y="204" textAnchor="middle" fill="rgba(255,255,255,.7)" fontSize="9" fontFamily="DM Sans">Brother</text>
                <line x1="142" y1="170" x2="100" y2="170" stroke="#ddd" strokeWidth="1.5"/>
                <line x1="142" y1="170" x2="205" y2="170" stroke="#ddd" strokeWidth="1.5"/>
                <line x1="142" y1="170" x2="300" y2="170" stroke="#ddd" strokeWidth="1.5"/>
              </svg>
            </div>
            <div className="absolute bottom-[-20px] left-[-24px] bg-white border border-warm rounded-[10px] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.1)] text-xs font-semibold flex items-center gap-2 text-sage">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#5a7a6a" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Works online & offline
            </div>
            <div className="absolute top-[24px] right-[-24px] bg-white border border-warm rounded-[10px] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.1)] text-xs font-semibold flex items-center gap-2 text-rust">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#b85c38" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              PDF / PNG ready
            </div>
          </div>
        </section>

        <section className="px-6 md:px-12 py-16 md:py-[96px]" id="features">
          <div className="max-w-[1100px] mx-auto">
            
            {/* Centered Header Section */}
            <div className="text-center flex flex-col items-center mb-16">
              <h2 className="font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em] mb-4">
                Why Choose <em className="italic text-gold font-semibold">Kinnect</em>
              </h2>
              <p className="text-[17px] text-slate leading-[1.65] max-w-[700px]">
                Our app offers a smarter, faster, and more flexible way to create kinship charts with features designed for convenience, collaboration, and accessibility.
              </p>
            </div>

            {/* Features Grid - Exactly 3 boxes per line on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              
              {/* CARD 1: Online & Offline Access */}
              <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-globe-icon lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></div>
                  <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Online & Offline Access</h3>
                  <p className="text-sm text-slate leading-[1.7]">Create and edit kinship charts anytime, anywhere. Your work remains accessible even without an internet connection.</p>
                </div>
              </div>

              {/* CARD 2: Export-Ready */}
              <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-down-icon lucide-file-down"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg></div>
                  <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Export-Ready</h3>
                  <p className="text-sm text-slate leading-[1.7]">Export your charts instantly for presentations, documentation, printing, or sharing with others.</p>
                </div>
              </div>

              {/* CARD 3: AI-Powered Chart Creation */}
              <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></div>
                  <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">AI-Powered Chart Creation</h3>
                  <p className="text-sm text-slate leading-[1.7]">Describe your family relationships in plain language, and the AI will automatically generate the kinship chart for you — no manual setup required.</p>
                </div>
              </div>

              {/* CARD 4: Cloud Sync with Google */}
              <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cloud-icon lucide-cloud"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></div>
                  <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Cloud Sync with Google</h3>
                  <p className="text-sm text-slate leading-[1.7]">Sign in with Google to securely sync your charts across devices and continue your work anytime.</p>
                </div>
              </div>

              {/* CARD 5: Connected Family Accounts */}
              <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-heart-handshake-icon lucide-heart-handshake"><path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762"/></svg></div>
                  <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Connected Family Accounts</h3>
                  <p className="text-sm text-slate leading-[1.7]">Assign Google accounts to specific family members or units in the chart. Changes and shared diagrams can automatically appear in the connected relative’s account.</p>
                </div>
              </div>

              {/* CARD 6: Modern & Interactive Workspace */}
              <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg></div>
                  <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Modern & Interactive Workspace</h3>
                  <p className="text-sm text-slate leading-[1.7]">Enjoy a clean, responsive, and intuitive interface designed for smooth navigation and effortless kinship mapping.</p>
                </div>
              </div>

            </div>
          </div>
        </section>

        <section className="bg-ink text-cream px-4 md:px-12 py-16 md:py-[96px]" id="how">
          <div className="max-w-[1100px] mx-auto">

            {/* Centered Header Section */}
            <div className="text-center flex flex-col items-center mb-16">
              <h2 className="font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em] mb-4">
                How <em className="italic text-gold font-semibold">Kinnect </em> Works
              </h2>
            </div>

            {/* Strictly 1 row of 5 columns on ALL screens */}
            <div className="max-h-screen grid grid-cols-5 gap-0 overflow-x-auto md:overflow-visible">
              
              {/* STEP 01 */}
              <div className="px-2 py-6 sm:px-4 md:p-8 border-r border-white/10 relative">
                <div className="font-serif text-[28px] sm:text-[40px] md:text-[56px] font-black text-gold leading-none mb-4">01</div>
                <h3 className="text-[13px] sm:text-[15px] md:text-[17px] font-semibold mb-2.5 text-cream">Create Your Chart</h3>
                <p className="text-[11px] sm:text-xs md:text-sm text-cream/55 leading-[1.6]">Start by dragging and placing family units onto the canvas.</p>
                <div className="hidden md:block absolute top-[56px] right-[-20px] w-10 h-0.5 bg-gradient-to-r from-gold/40 to-transparent z-10"></div>
              </div>

              {/* STEP 02 */}
              <div className="px-2 py-6 sm:px-4 md:p-8 border-r border-white/10 relative">
                <div className="font-serif text-[28px] sm:text-[40px] md:text-[56px] font-black text-gold leading-none mb-4">02</div>
                <h3 className="text-[13px] sm:text-[15px] md:text-[17px] font-semibold mb-2.5 text-cream">Connect Relationships</h3>
                <p className="text-[11px] sm:text-xs md:text-sm text-cream/55 leading-[1.6]">Draw connections between people to represent structures.</p>
                <div className="hidden md:block absolute top-[56px] right-[-20px] w-10 h-0.5 bg-gradient-to-r from-gold/40 to-transparent z-10"></div>
              </div>

              {/* STEP 03 */}
              <div className="px-2 py-6 sm:px-4 md:p-8 border-r border-white/10 relative">
                <div className="font-serif text-[28px] sm:text-[40px] md:text-[56px] font-black text-gold leading-none mb-4">03</div>
                <h3 className="text-[13px] sm:text-[15px] md:text-[17px] font-semibold mb-2.5 text-cream">Use AI for Speed</h3>
                <p className="text-[11px] sm:text-xs md:text-sm text-cream/55 leading-[1.6]">Describe relationships, and the AI will generate the chart.</p>
                <div className="hidden md:block absolute top-[56px] right-[-20px] w-10 h-0.5 bg-gradient-to-r from-gold/40 to-transparent z-10"></div>
              </div>

              {/* STEP 04 */}
              <div className="px-2 py-6 sm:px-4 md:p-8 border-r border-white/10 relative">
                <div className="font-serif text-[28px] sm:text-[40px] md:text-[56px] font-black text-gold leading-none mb-4">04</div>
                <h3 className="text-[13px] sm:text-[15px] md:text-[17px] font-semibold mb-2.5 text-cream">Auto-Labeling</h3>
                <p className="text-[11px] sm:text-xs md:text-sm text-cream/55 leading-[1.6]">Smart system automatically detects and labels roles.</p>
                <div className="hidden md:block absolute top-[56px] right-[-20px] w-10 h-0.5 bg-gradient-to-r from-gold/40 to-transparent z-10"></div>
              </div>

              {/* STEP 05 */}
              <div className="px-2 py-6 sm:px-4 md:p-8 relative">
                <div className="font-serif text-[28px] sm:text-[40px] md:text-[56px] font-black text-gold leading-none mb-4">05</div>
                <h3 className="text-[13px] sm:text-[15px] md:text-[17px] font-semibold mb-2.5 text-cream">Export Your Work</h3>
                <p className="text-[11px] sm:text-xs md:text-sm text-cream/55 leading-[1.6]">Export your kinship chart as a PDF or PNG file.</p>
              </div>

            </div>
          </div>
        </section>

        <section className="bg-cream/40 px-6 md:px-12 py-16 md:py-24 border-t border-warm" id="team">
          <div className="max-w-[1100px] mx-auto text-center">
            

            <div className="text-center flex flex-col items-center mb-16">
              <h2 className="font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em] mb-4">
                Meet the <em className="italic text-gold font-semibold">Developers</em>
              </h2>
              <p className="text-[17px] text-slate leading-[1.65] max-w-[780px]">
                We are a team of Computer Science students from the <span className="font-semibold text-ink">University of the Philippines Los Baños</span>, bridging technology and genealogy to build a smarter way to connect.
              </p>
            </div>
            
            {/* Team Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Project Manager */}
              <div className="bg-white border border-warm rounded-2xl p-6 shadow-[0_4px_24px_rgba(15,14,13,0.02)] hover:border-gold/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-ink text-cream flex items-center justify-center font-sans font-bold text-lg mb-4 shadow-sm">
                  DE
                </div>
                <h3 className="font-sans font-bold text-[17px] text-ink mb-1">Dave Andrie Elcarte</h3>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold">Project Manager</p>
              </div>

              {/* Backend */}
              <div className="bg-white border border-warm rounded-2xl p-6 shadow-[0_4px_24px_rgba(15,14,13,0.02)] hover:border-gold/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-ink text-cream flex items-center justify-center font-sans font-bold text-lg mb-4 shadow-sm">
                  AL
                </div>
                <h3 className="font-sans font-bold text-[17px] text-ink mb-1">Angel Laxamana</h3>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold">Backend Developer</p>
              </div>

              {/* Frontend 1 */}
              <div className="bg-white border border-warm rounded-2xl p-6 shadow-[0_4px_24px_rgba(15,14,13,0.02)] hover:border-gold/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-ink text-cream flex items-center justify-center font-sans font-bold text-lg mb-4 shadow-sm">
                  ZM
                </div>
                <h3 className="font-sans font-bold text-[17px] text-ink mb-1">Zerine Daphne Maiso</h3>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold">Frontend Developer</p>
              </div>

              {/* Frontend 2 */}
              <div className="bg-white border border-warm rounded-2xl p-6 shadow-[0_4px_24px_rgba(15,14,13,0.02)] hover:border-gold/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-ink text-cream flex items-center justify-center font-sans font-bold text-lg mb-4 shadow-sm">
                  AP
                </div>
                <h3 className="font-sans font-bold text-[17px] text-ink mb-1">Arianne Mae Paleracio</h3>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold">Frontend Developer</p>
              </div>

            </div>
          </div>
        </section>

        <section className="bg-ink text-cream px-6 md:px-12 py-20 md:py-[120px] text-center relative overflow-hidden">
          <div className="absolute w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(201,147,58,.12)_0%,transparent_65%)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
          <div className="relative z-10">
            <span className="inline-block text-[12px] font-bold text-gold tracking-[0.1em] uppercase mb-5">Get started today</span>
            <h2 className="font-serif text-[clamp(36px,5vw,64px)] font-black leading-[1.05] mb-5">Ready to map your family's <em className="italic text-gold font-semibold">full story?</em></h2>
            <p className="text-[17px] text-cream/60 mb-12">Free forever for single users. No credit card required.</p>
            
            <div className="flex gap-4 justify-center flex-wrap">
              <InstallButton className="flex items-center gap-2.5 px-8 py-4 rounded-[10px] bg-cream text-ink font-sans text-[15px] font-semibold cursor-pointer border-none transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,.3)] hover:bg-gold hover:-translate-y-0.5"/>
              <button 
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={busyAction === "auth"}
              className="flex items-center gap-2.5 px-7 py-[15px] rounded-[10px] bg-transparent text-cream font-sans text-[15px] font-medium cursor-pointer border-[1.5px] border-white/20 transition-all duration-300 hover:border-gold-light hover:text-gold-light">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {busyAction === "auth"
                  ? "Redirecting to Google…"
                  : "Continue with Google"}
              </button>
            </div>
            <p className="mt-2.5 text-xs text-[#8a8a8a] flex items-center justify-center gap-[5px] text-center">
              <svg className="shrink-0" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Google login is only used for cloud syncing & sharing — never for ads or tracking.
            </p>
          </div>
        </section>

        <footer className="bg-[#080807] text-cream/40 px-6 md:px-12 py-8 md:py-10 text-center flex flex-col items-center">
          © 2026 Kinnect. All rights reserved.
        </footer>
      </>
    )}

    </main>
  );
}