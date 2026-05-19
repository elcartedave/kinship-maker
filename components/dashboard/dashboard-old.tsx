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
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
      <section className="paper-panel overflow-hidden rounded-[2rem]">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.85fr] lg:p-10">
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent-strong">
              Offline-first kinship chart studio
            </p>
            <div className="space-y-4">
              <h1 className="font-display max-w-3xl text-4xl leading-tight text-ink sm:text-5xl lg:text-6xl">
                {APP_NAME} keeps your charts alive online, offline, and ready to
                export.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-ink-soft sm:text-lg">
                Drag kinship symbols onto an infinite canvas, connect them with
                relationship lines, autosave locally, and export exactly around
                the chart you placed.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {(!authEnabled || user) ? (
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
                  Sign in with Google (in the cloud panel) to create a new chart
                  or open the sample diagram.
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
                <p className="mt-3 text-sm leading-7 text-ink-soft">{cloudLabel}</p>
              </div>

              {authEnabled ? (
                user ? (
                  <div className="space-y-3 rounded-[1.5rem] border border-line bg-white/80 p-4">
                    <p className="text-sm font-semibold text-ink">{user.email}</p>
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
                  `NEXT_PUBLIC_SUPABASE_ANON_KEY` to turn on private cloud sync.
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
              <p className="text-lg font-semibold text-ink">Sign in to see charts</p>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                Your charts are tied to your Google account. Use{" "}
                <strong>Continue with Google</strong> in the cloud panel above,
                then return here to open or delete them.
              </p>
            </div>
          ) : charts.length === 0 ? (
            <div className="paper-panel rounded-[1.75rem] p-8 text-center">
              <p className="text-lg font-semibold text-ink">No charts yet</p>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                Start a blank chart or load the sample diagram to get the symbol
                library and exports moving right away.
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
                        {authEnabled ? "Your chart" : chart.ownerId ? "Cloud-ready" : "Local"}
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
                    <button
                      type="button"
                      onClick={() => void handleDelete(chart.id)}
                      disabled={busyAction === chart.id}
                      className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 hover:bg-white disabled:cursor-wait disabled:opacity-60"
                    >
                      {busyAction === chart.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="paper-panel rounded-[1.75rem] p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
            Setup notes
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-ink-soft">
            <li>Offline charts live in IndexedDB, so they reopen on the same device even without a network.</li>
            <li>Private cloud sync depends on Supabase auth and the `charts` table with row-level security.</li>
            <li>Sign-in uses Google OAuth via Supabase. Enable the Google provider in <strong>Auth → Providers</strong> and add your origin to the redirect allow-list.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
