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
import { InstallButtonBig } from "@/components/pwa/install-button-big";
import { useAppShell } from "@/components/providers/app-shell";
import { APP_NAME } from "@/lib/kinship/constants";
import {
  createChartRecord,
  createEmptyChartDocument,
} from "@/lib/kinship/document";
import {
  createChartFromDocument,
  listCharts,
  markChartDeleted,
  remoteChartToLocal,
  saveChartRecord,
} from "@/lib/kinship/local-store";
import { createSampleChartDocument } from "@/lib/kinship/sample-chart";
import type { ChartRecord } from "@/lib/kinship/types";

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
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
    const owned = items.filter(
      (c) => c.ownerId === user.id && !c.deleted,
    );
    startTransition(() => setCharts(owned));
  }, [authEnabled, user]);

  useEffect(() => {
    void loadCharts();
  }, [loadCharts, lastSync]);

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
    const document = createEmptyChartDocument("Untitled chart");
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

    await saveChartRecord(remoteChartToLocal(data));
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
    const document = createSampleChartDocument();
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

    await saveChartRecord(remoteChartToLocal(data));
    await loadCharts();
    router.push(`/charts/${id}`);
    setBusyAction(null);
  }

  async function handleDelete(id: string) {
    if (authEnabled && !user) {
      return;
    }

    setBusyAction(id);
    await markChartDeleted(id);
    await loadCharts();

    if (user) {
      await syncNow();
    }

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

  return (
    <main>
      
      <nav id="navbar" className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 md:px-12 py-4 md:py-5 bg-cream/85 backdrop-blur-md border-b border-gold/15 transition-all duration-300">
        <a href="#" className="flex items-center gap-2.5 font-serif text-[22px] font-bold text-ink no-underline">
          <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="8" r="5" fill="#c9933a"/>
            <circle cx="6" cy="24" r="4" fill="#5a7a6a"/>
            <circle cx="26" cy="24" r="4" fill="#b85c38"/>
            <line x1="16" y1="13" x2="16" y2="18" stroke="#c9933a" strokeWidth="1.5"/>
            <line x1="16" y1="18" x2="6" y2="20" stroke="#c9933a" strokeWidth="1.5"/>
            <line x1="16" y1="18" x2="26" y2="20" stroke="#c9933a" strokeWidth="1.5"/>
          </svg>
          Kin<span className="text-gold">ship</span>
        </a>

        {authEnabled && 
          ( user ? (
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
              <>
                <ul className="hidden md:flex gap-8 list-none">
                  <li><a href="#features" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">Features</a></li>
                  <li><a href="#how" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">How it works</a></li>
                  <li><a href="#collab" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">Collaborate</a></li>
                  <li><a href="#devs" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">Developers</a></li>
                </ul>
                <a href="#" className="px-[22px] py-2.5 rounded-lg bg-ink text-cream text-sm font-medium cursor-pointer border-none tracking-wide transition-all duration-250 no-underline inline-block hover:bg-gold hover:text-ink">Get Started Free</a>
              </>
              
            )
          )
        }
      </nav>

      {(!authEnabled || user) ? (
        <section className="min-h-screen bg-gradient-to-b from-[#f6f1e8] via-[#ebdcc5] to-[#f6f1e8] pt-[84px] overflow-hidden selection:bg-gold/20">
          
          {/* HERO / WELCOME BANNER (LIGHT START) */}
          <div className="relative border-b border-[#eadfcd]/40">
            <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
              <div className="absolute left-1/2 top-[-220px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#fff8ef]/60 blur-3xl" />
              <div className="absolute right-0 top-0 h-full w-[500px] opacity-100 mix-blend-multiply">
              </div>
            </div>

            <div className="relative z-10 mx-auto flex max-w-[1600px] flex-col justify-between gap-12 px-6 py-14 lg:flex-row lg:items-center lg:px-12">
              {/* Left Side: Copy */}
              <div className="max-w-[620px]">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold border border-gold/10 backdrop-blur-xl">
                  <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
                  Workspace Ready
                </div>

                <h1 className="font-serif text-[clamp(44px,6vw,92px)] font-black leading-[0.95] tracking-[-0.05em] text-ink">
                  Welcome back,
                  <span className="block text-gold font-serif mt-1">
                    {user?.email?.split("@")[0] ?? "Researcher"}
                  </span>
                </h1>

                <p className="mt-6 max-w-[500px] text-lg md:text-[20px] leading-relaxed text-ink/70">
                  Continue building family diagrams, organizing generations,
                  and collaborating seamlessly across devices.
                </p>
              </div>

              {/* Right Side: Quick Action Grid */}
              <div className="flex flex-wrap gap-4 sm:grid sm:grid-cols-3 lg:flex">
                {/* CREATE NEW CHART */}
                <button
                  type="button"
                  onClick={() => void handleCreateChart()}
                  disabled={busyAction === "new"}
                  className="group flex h-[180px] w-full sm:w-[200px] flex-col items-center justify-center rounded-3xl bg-ink text-cream shadow-xl shadow-ink/10 transition-all duration-300 hover:-translate-y-1.5 hover:bg-gold hover:text-ink hover:shadow-gold/20 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {/* Icon Container */}
                  <div className="mb-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cream/30 text-4xl font-light transition-colors group-hover:border-ink/30">
                    +
                  </div>
                  {/* Text block with fixed height/centering to guarantee perfect alignment */}
                  <span className="text-[22px] font-bold tracking-tight text-center px-2 h-[32px] flex items-center justify-center">
                    {busyAction === "new" ? "Creating..." : "New Chart"}
                  </span>
                </button>

                {/* LOAD SAMPLE */}
                <button
                  type="button"
                  onClick={() => void handleCreateSample()}
                  disabled={busyAction === "sample"}
                  className="group flex h-[180px] w-full sm:w-[200px] flex-col items-center justify-center rounded-3xl border border-[#eadfcd] bg-white/80 text-ink shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-gold hover:bg-white hover:shadow-md disabled:opacity-50 disabled:pointer-events-none"
                >
                  {/* Icon Container (matches dimensions of the first button perfectly) */}
                  <div className="mb-4 flex h-14 w-14 shrink-0 items-center justify-center">
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="opacity-60 transition-transform group-hover:scale-105 text-gold"
                    >
                      <path d="M3 7h18v10H3z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M7 7V3h10v4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8 12h8" strokeLinecap="round" />
                      <path d="M12 8v8" strokeLinecap="round" />
                    </svg>
                  </div>
                  {/* Text block with identical fixed layout parameters */}
                  <span className="text-[22px] font-bold tracking-tight text-center px-2 h-[32px] flex items-center justify-center">
                    {busyAction === "sample" ? "Loading..." : "Load Sample"}
                  </span>
                </button>

                {/* INSTALL APP */}
                <InstallButtonBig
                  className="flex h-[180px] w-full sm:w-[200px] flex-col items-center justify-center rounded-3xl border border-[#eadfcd] bg-white/80 text-ink shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-gold hover:bg-white hover:shadow-md"
                />
              </div>
            </div>
          </div>

          {/* MAIN CONTENT WORKSPACE AREA (MID-DARK TRANSITION TO LIGHT BASE) */}
          <div className="max-w-[1600px] mx-auto px-6 py-16 md:px-12">
                      
            {/* WORKSPACE HEADER SECTION WITH VIEW CONTROLLERS & SORT */}
            <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-dark font-medium">
                  RECENT CHARTS
                </p>
                <h2 className="mt-1 font-serif text-3xl md:text-4xl font-black tracking-tight text-ink">
                  Pick up where you left off
                </h2>
                <p className="text-sm text-ink/50 font-medium mt-3">
                  {charts.length} {charts.length === 1 ? "chart" : "charts"} available
                </p>
              </div>

              {/* VIEW TOGGLES & SORT CONTROL (Hidden if workspace is empty) */}
              {charts.length > 0 && (
                <div className="flex items-center gap-3 select-none shrink-0 self-end sm:self-auto">
                  
                  {/* Sort by Date Button */}
                  <button
                    type="button"
                    onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
                    className="flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 text-xs font-bold text-ink shadow-sm transition-all duration-200 hover:bg-ink/[0.02]"
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

                  {/* Grid View Toggle */}
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                    className={`flex h-10 w-14 items-center justify-center rounded-xl border transition-all duration-200 ${
                      viewMode === "grid"
                        ? "border-black/10 bg-white text-ink shadow-sm"
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

                  {/* List View Toggle */}
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                    className={`flex h-10 w-14 items-center justify-center rounded-xl border transition-all duration-200 ${
                      viewMode === "list"
                        ? "border-black/10 bg-white text-ink shadow-sm"
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
              /* EMPTY STATE CONTAINER */
              <div className="rounded-[32px] border border-dashed border-[#eadfcd] bg-white/70 p-12 md:p-20 text-center backdrop-blur-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f6f1e8] text-gold">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <h3 className="font-serif text-2xl font-black text-ink">
                  Your workspace is empty
                </h3>
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-ink/60">
                  Create a clean chart or load a predefined archetype template to begin tracking your lineage trees.
                </p>
              </div>
            ) : (
              <div>
                {/* CONDITIONAL RENDERING CONTAINER */}
                {viewMode === "grid" ? (
                  /* ==================== GRID VIEW ==================== */
                  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {sortedCharts.map((chart) => {
                      const isDeleting = busyAction === chart.id;
                      return (
                        <article
                          key={chart.id}
                          className="group flex flex-col justify-between rounded-[24px] border border-[#eadfcd]/70 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-ink/[0.04]"
                        >
                          <div>
                            {/* SVG Thumbnail Container */}
                            <div className="mb-4 rounded-xl bg-[#f6f1e8]/60 p-4 border border-[#eadfcd]/30 relative overflow-hidden">
                              <svg viewBox="0 0 240 100" className="h-24 w-full transition-transform duration-500 group-hover:scale-102">
                                <circle cx="50" cy="30" r="10" fill="#c9933a" />
                                <circle cx="120" cy="30" r="10" fill="#5a7a6a" />
                                <circle cx="190" cy="30" r="10" fill="#b85c38" />
                                <line x1="50" y1="30" x2="120" y2="30" stroke="#b0a290" strokeWidth="1.5" />
                                <line x1="120" y1="30" x2="190" y2="30" stroke="#b0a290" strokeWidth="1.5" />
                                <circle cx="120" cy="75" r="10" fill="#0f0e0d" />
                                <line x1="120" y1="40" x2="120" y2="65" stroke="#b0a290" strokeWidth="1.5" />
                              </svg>
                            </div>

                            {/* Title Link */}
                            <Link
                              href={`/charts/${chart.id}`}
                              className="block font-serif text-2xl font-black tracking-tight text-ink hover:text-gold transition-colors"
                            >
                              {chart.title}
                            </Link>

                            <p className="mt-1.5 text-xs text-ink/50 font-medium">
                              Modified {formatUpdatedAt(chart.updatedAt)}
                            </p>

                            {/* Badges */}
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

                          {/* Footer Action Strip */}
                          <div className="mt-6 flex items-center gap-3 border-t border-[#eadfcd]/40 pt-4">
                            <Link
                              href={`/charts/${chart.id}`}
                              className="flex-1 block rounded-xl bg-ink h-[46px] flex items-center justify-center text-center transition-all hover:bg-gold hover:text-ink btn-hover-target-grid"
                            >
                              <span className="text-xs font-bold !text-white [.btn-hover-target-grid:hover_&]:!text-ink transition-colors">
                                Open Editor
                              </span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => void handleDelete(chart.id)}
                              disabled={isDeleting}
                              aria-label="Delete chart"
                              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-ink/70 transition-all hover:border-rust hover:bg-rust/5 hover:text-rust disabled:opacity-40"
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
                  /* ==================== LIST VIEW ==================== */
                  <div className="flex flex-col gap-3">
                    {sortedCharts.map((chart) => {
                      const isDeleting = busyAction === chart.id;
                      return (
                        <article
                          key={chart.id}
                          className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-[#eadfcd]/60 bg-white p-4 transition-all duration-200 hover:border-[#eadfcd] hover:shadow-md hover:shadow-ink/[0.02]"
                        >
                          {/* Left Content Column */}
                          <div className="flex items-center gap-4">
                            {/* Compact Mini-Thumbnail for List row */}
                            <div className="hidden sm:flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-[#f6f1e8]/60 border border-[#eadfcd]/30 overflow-hidden">
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
                                  className="font-serif text-xl font-bold tracking-tight text-ink hover:text-gold transition-colors"
                                >
                                  {chart.title}
                                </Link>
                                
                                {/* Row Badges */}
                                <span className="rounded-full bg-[#eef0e5] px-2.5 py-0.5 text-[11px] font-bold text-[#5f6d53]">
                                  {authEnabled ? "Your Chart" : chart.ownerId ? "Cloud-Ready" : "Local"}
                                </span>
                                {chart.dirty && (
                                  <span className="rounded-full bg-[#fff3d8] px-2.5 py-0.5 text-[11px] font-bold text-[#b8860b] animate-pulse">
                                    Pending save
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ink/40 font-medium mt-0.5">
                                Modified {formatUpdatedAt(chart.updatedAt)}
                              </p>
                            </div>
                          </div>

                          {/* Right Row Actions */}
                          <div className="mt-4 sm:mt-0 flex items-center gap-2 sm:w-auto w-full">
                            <Link
                              href={`/charts/${chart.id}`}
                              className="flex-1 block rounded-xl px-5 bg-ink h-[46px] flex items-center justify-center text-center transition-all hover:bg-gold hover:text-ink btn-hover-target-grid"
                            >
                              <span className="text-xs font-bold !text-white [.btn-hover-target-grid:hover_&]:!text-ink transition-colors">
                                Open Editor
                              </span> 
                            </Link>

                            <button
                              type="button"
                              onClick={() => void handleDelete(chart.id)}
                              disabled={isDeleting}
                              aria-label="Delete chart"
                              className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-ink/70 transition-all hover:border-rust hover:bg-rust/5 hover:text-rust disabled:opacity-40"
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
          <section className="min-h-screen grid grid-cols-1 md:grid-cols-2 items-center px-6 md:px-12 pt-[100px] md:pt-[120px] pb-[60px] md:pb-20 gap-6 md:gap-12 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_60%_at_70%_50%,rgba(201,147,58,.08)_0%,transparent_70%)]"></div>
            
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gold/12 border border-gold/30 text-xs font-semibold text-gold tracking-[0.08em] uppercase mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-fast"></span>
                New · Version 2.0 just launched
              </div>
              <h1 className="font-serif text-[clamp(42px,5vw,72px)] font-black leading-[1.05] tracking-[-0.02em] mb-6">Map Every <em className="italic text-gold">Branch</em> of Your Family Tree</h1>
              <p className="text-lg leading-[1.65] text-slate max-w-[480px] mb-10">The professional kinship diagram tool built for researchers, social workers, and families. Create, share, and export in minutes.</p>

              <div className="flex gap-3 flex-wrap mb-10">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-warm text-[13px] font-semibold text-ink shadow-[0_2px_8px_rgba(0,0,0,.05)]">
                  <div className="w-2 h-2 rounded-full bg-[#4caf7d] shadow-[0_0_0_3px_rgba(76,175,125,.2)]"></div> Works Online
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-warm text-[13px] font-semibold text-ink shadow-[0_2px_8px_rgba(0,0,0,.05)]">
                  <div className="w-2 h-2 rounded-full bg-gold shadow-[0_0_0_3px_rgba(201,147,58,.2)]"></div> Works Offline
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-warm text-[13px] font-semibold text-ink shadow-[0_2px_8px_rgba(0,0,0,.05)]">
                  <div className="w-2 h-2 rounded-full bg-rust shadow-[0_0_0_3px_rgba(184,92,56,.2)]"></div> Export-Ready
                </div>
              </div>

              <div>
                <div className="flex gap-4 items-center flex-wrap">
                  <InstallButton className="flex items-center gap-2.5 px-7 py-[15px] rounded-[10px] bg-ink text-cream font-sans text-[15px] font-semibold cursor-pointer border-none transition-all duration-300 no-underline shadow-[0_4px_20px_rgba(15,14,13,.2)] hover:bg-gold hover:text-ink hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(201,147,58,.3)]" />
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
                3 collaborators online
              </div>
              <div className="absolute top-[24px] right-[-24px] bg-white border border-warm rounded-[10px] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.1)] text-xs font-semibold flex items-center gap-2 text-rust">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#b85c38" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                PDF / PNG ready
              </div>
            </div>
          </section>

          <section className="bg-ink text-cream px-6 md:px-12 py-20 md:py-[120px] text-center relative overflow-hidden">
            <div className="absolute w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(201,147,58,.12)_0%,transparent_65%)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            <div className="relative z-10">
              <span className="inline-block text-[12px] font-bold text-gold tracking-[0.1em] uppercase mb-5">Get started today</span>
              <h2 className="font-serif text-[clamp(36px,5vw,64px)] font-black leading-[1.05] mb-5">Ready to map your family's <em className="italic text-gold-light">full story?</em></h2>
              <p className="text-[17px] text-cream/60 mb-12">Free forever for single users. No credit card required.</p>
              
              <div className="flex gap-4 justify-center flex-wrap">
                <InstallButton className="flex items-center gap-2.5 px-8 py-4 rounded-[10px] bg-cream text-ink font-sans text-[15px] font-semibold cursor-pointer border-none transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,.3)] hover:bg-gold hover:-translate-y-0.5" />
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
              <p className="mt-5 text-[13px] text-cream/35">
                🔒 Google is used only for syncing & sharing — never for ads.
              </p>
            </div>
          </section>
        </>
      )}
      

    </main>
  );
}
