"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  startTransition,
  useEffect,
  useMemo,
  useState,
} from "react";

import { InstallButton } from "@/components/pwa/install-button";
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
import type { ChartDocument } from "@/lib/kinship/types";
import type { ChartRecord } from "@/lib/kinship/types";

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
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [sexAssignedAtBirth, setSexAssignedAtBirth] =
    useState<SexAssignedAtBirth>(null);
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
    <>
      <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <section className="paper-panel overflow-hidden rounded-[2rem]">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.85fr] lg:p-10">
            <div className="space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent-strong">
                Offline-first kinship chart studio
              </p>
              <div className="space-y-4">
                <h1 className="font-display max-w-3xl text-4xl leading-tight text-ink sm:text-5xl lg:text-6xl">
                  {APP_NAME} keeps your charts alive online, offline, and ready
                  to export.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-ink-soft sm:text-lg">
                  Drag kinship symbols onto an infinite canvas, connect them
                  with relationship lines, autosave locally, and export exactly
                  around the chart you placed.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {!authEnabled || user ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleCreateChart()}
                      disabled={busyAction === "new"}
                      className="rounded-full bg-accent px-5 py-3 font-semibold text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-70"
                    >
                      {busyAction === "new" ? "Creating..." : "New chart"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreateSample()}
                      disabled={busyAction === "sample"}
                      className="rounded-full border border-line bg-white/70 px-5 py-3 font-semibold text-ink transition hover:border-accent/40 hover:bg-white"
                    >
                      {busyAction === "sample"
                        ? "Loading sample..."
                        : "Load sample chart"}
                    </button>
                  </>
                ) : (
                  <p className="max-w-md rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm leading-6 text-ink-soft">
                    Sign in with Google (in the cloud panel) to create a new
                    chart or open the sample diagram.
                  </p>
                )}
                <InstallButton className="rounded-full border border-line bg-white/70 px-5 py-3 font-semibold text-ink transition hover:border-accent/40 hover:bg-white" />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
                <span className="rounded-full bg-white/80 px-3 py-1">
                  Infinite canvas
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1">
                  Cropped PNG and PDF
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1">
                  Local autosave
                </span>
              </div>
            </div>

            <aside className="paper-grid rounded-[1.75rem] border border-line/80 bg-panel-strong/90 p-5 sm:p-6">
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
                    Cloud status
                  </p>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">
                    {cloudLabel}
                  </p>
                </div>

                {authEnabled ? (
                  user ? (
                    <div className="space-y-3 rounded-[1.5rem] border border-line bg-white/80 p-4">
                      <p className="text-sm font-semibold text-ink">
                        {user.email}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void syncNow().then(() => {
                              void loadCharts();
                            })
                          }
                          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                        >
                          Sync now
                        </button>
                        <button
                          type="button"
                          onClick={() => void signOut()}
                          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 hover:bg-white"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-[1.5rem] border border-line bg-white/80 p-4">
                      <p className="text-sm font-semibold text-ink">
                        Sign in to sync to the cloud
                      </p>
                      <p className="text-xs leading-5 text-ink-soft">
                        We use your Google account so only you can create, open,
                        and delete your charts. They are stored in your private
                        cloud and cached on this device while you edit.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleGoogleSignIn()}
                        disabled={busyAction === "auth"}
                        className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm transition hover:border-accent/40 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          aria-hidden="true"
                        >
                          <path
                            fill="#4285F4"
                            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.61z"
                          />
                          <path
                            fill="#34A853"
                            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M3.97 10.71a5.4 5.4 0 0 1 0-3.43V4.96H.96a9 9 0 0 0 0 8.07l3.01-2.32z"
                          />
                          <path
                            fill="#EA4335"
                            d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A9 9 0 0 0 .96 4.96l3.01 2.32C4.69 5.16 6.66 3.58 9 3.58z"
                          />
                        </svg>
                        {busyAction === "auth"
                          ? "Redirecting to Google…"
                          : "Continue with Google"}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-line bg-white/70 p-4 text-sm leading-7 text-ink-soft">
                    Add `NEXT_PUBLIC_SUPABASE_URL` and either
                    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or
                    `NEXT_PUBLIC_SUPABASE_ANON_KEY` to turn on private cloud
                    sync.
                  </div>
                )}

                {feedback ? (
                  <p className="rounded-[1.25rem] bg-white/70 px-4 py-3 text-sm leading-6 text-ink-soft">
                    {feedback}
                  </p>
                ) : null}

                {syncError ? (
                  <p className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    Cloud sync failed: {syncError}
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
                  Recent charts
                </p>
                <h2 className="font-display mt-2 text-3xl text-ink">
                  Pick up where you left off
                </h2>
              </div>
              {authEnabled && !user ? null : (
                <p className="text-sm text-ink-soft">
                  {charts.length} {charts.length === 1 ? "chart" : "charts"}
                </p>
              )}
            </div>

            {authEnabled && loadingAuth ? (
              <div className="paper-panel rounded-[1.75rem] p-8 text-center">
                <p className="text-sm text-ink-soft">Loading your charts…</p>
              </div>
            ) : authEnabled && !user ? (
              <div className="paper-panel rounded-[1.75rem] p-8 text-center">
                <p className="text-lg font-semibold text-ink">
                  Sign in to see charts
                </p>
                <p className="mt-3 text-sm leading-7 text-ink-soft">
                  Your charts are tied to your Google account. Use{" "}
                  <strong>Continue with Google</strong> in the cloud panel
                  above, then return here to open or delete them.
                </p>
              </div>
            ) : charts.length === 0 ? (
              <div className="paper-panel rounded-[1.75rem] p-8 text-center">
                <p className="text-lg font-semibold text-ink">No charts yet</p>
                <p className="mt-3 text-sm leading-7 text-ink-soft">
                  Start a blank chart or load the sample diagram to get the
                  symbol library and exports moving right away.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {charts.map((chart) => (
                  <article
                    key={chart.id}
                    className="paper-panel rounded-[1.75rem] p-5 transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          href={`/charts/${chart.id}`}
                          className="font-display line-clamp-2 text-2xl text-ink"
                        >
                          {chart.title}
                        </Link>
                        <p className="mt-2 text-sm text-ink-soft">
                          Updated {formatUpdatedAt(chart.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
                        <span className="rounded-full bg-white/80 px-3 py-2">
                          {authEnabled
                            ? chart.ownerId === user?.id
                              ? "Your chart"
                              : "Shared chart"
                            : chart.ownerId
                              ? "Cloud-ready"
                              : "Local"}
                        </span>
                        {chart.dirty ? (
                          <span className="rounded-full bg-amber-100 px-3 py-2 text-amber-800">
                            Pending save
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href={`/charts/${chart.id}`}
                        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                      >
                        Open editor
                      </Link>
                      {authEnabled &&
                      user &&
                      chart.ownerId !== user.id ? null : (
                        <button
                          type="button"
                          onClick={() => {
                            setFeedback(null);
                            setDeleteCandidateId(chart.id);
                          }}
                          disabled={busyAction === chart.id}
                          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 hover:bg-white disabled:cursor-wait disabled:opacity-60"
                        >
                          {busyAction === chart.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="paper-panel rounded-[1.75rem] p-5">
            <div className="mb-6 border-b border-line pb-5">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
                Notifications
              </p>
              {pendingInvitations.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {pendingInvitations.map((invitation) => (
                    <article
                      key={invitation.id}
                      className="rounded-[1.25rem] border border-line bg-white/75 p-3"
                    >
                      <p className="text-sm font-semibold text-ink">
                        Kinship approval request
                      </p>
                      <p className="mt-2 text-xs leading-5 text-ink-soft">
                        {invitation.inviterLabel} linked you to a node in{" "}
                        <strong>{invitation.chartTitle}</strong>.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyAction === invitation.id}
                          onClick={() =>
                            void handleInvitation(invitation.id, "approve")
                          }
                          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-70"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyAction === invitation.id}
                          onClick={() =>
                            void handleInvitation(invitation.id, "reject")
                          }
                          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent/40 hover:bg-white disabled:cursor-wait disabled:opacity-70"
                        >
                          Decline
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-ink-soft">
                  No pending kinship approvals.
                </p>
              )}
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
              Setup notes
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-ink-soft">
              <li>
                Offline charts live in IndexedDB, so they reopen on the same
                device even without a network.
              </li>
              <li>
                Private cloud sync depends on Supabase auth and the `charts`
                table with row-level security.
              </li>
              <li>
                Sign-in uses Google OAuth via Supabase. Enable the Google
                provider in <strong>Auth → Providers</strong> and add your
                origin to the redirect allow-list.
              </li>
            </ul>
          </aside>
        </section>
      </main>
      {deleteCandidateId ? (
        <DeleteConfirmationModal
          busy={busyAction === deleteCandidateId}
          chartTitle={
            charts.find((chart) => chart.id === deleteCandidateId)?.title ??
            "this chart"
          }
          onCancel={() => setDeleteCandidateId(null)}
          onConfirm={() => void handleDelete(deleteCandidateId)}
          error={feedback}
        />
      ) : null}
    </>
  );
}

function DeleteConfirmationModal({
  busy,
  chartTitle,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  chartTitle: string;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(24,18,10,0.35)] px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-chart-title"
        className="paper-panel w-full max-w-md rounded-[1.75rem] p-6"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
          Delete chart
        </p>
        <h2
          id="delete-chart-title"
          className="font-display mt-3 text-3xl text-ink"
        >
          Delete {chartTitle}?
        </h2>
        <p className="mt-3 text-sm leading-7 text-ink-soft">
          This permanently removes the chart from the cloud and this device. If
          this chart is shared, it will also be removed for approved members.
        </p>
        {error ? (
          <p className="mt-4 rounded-[1rem] border border-[rgba(153,53,36,0.22)] bg-white/80 px-3 py-2 text-sm leading-6 text-[rgb(153,53,36)]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 disabled:cursor-wait disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-[rgb(153,53,36)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[rgb(125,39,25)] disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? "Deleting..." : "Delete chart"}
          </button>
        </div>
      </section>
    </div>
  );
}
