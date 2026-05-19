"use client";

import {
  createContext,
  useCallback,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { purgeChartsNotOwnedBy } from "@/lib/kinship/local-store";
import { pushSingleChart, syncChartsForUser } from "@/lib/kinship/sync";
import type { SyncSummary } from "@/lib/kinship/types";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type AppShellContextValue = {
  authEnabled: boolean;
  loadingAuth: boolean;
  lastSync: SyncSummary | null;
  /**
   * User-facing message describing why the most recent sync attempt failed,
   * or `null` if the last attempt succeeded / no attempt has happened yet.
   * Translated from common Supabase / PostgREST codes (e.g. PGRST205) into
   * actionable hints (see `friendlyCloudErrorMessage`).
   */
  syncError: string | null;
  supabase: SupabaseClient | null;
  syncNow: () => Promise<SyncSummary | null>;
  /**
   * Fast path: push a SINGLE chart (the one currently being edited)
   * instead of scanning the user's full library. Used by the editor's
   * autosave-driven cloud sync so each change costs one upsert instead
   * of `SELECT * FROM charts` plus a per-row loop.
   */
  syncChart: (chartId: string) => Promise<SyncSummary | null>;
  /**
   * Kicks off a Google OAuth sign-in flow via Supabase. Resolves with `null`
   * on success (the browser is redirected to Google before this resolves) or
   * a user-facing error string when the request could not be initiated.
   *
   * `nextPath` is the in-app path the user should land on after the redirect
   * to `/auth/confirm` exchanges the code for a session. Defaults to `"/"`.
   */
  signInWithGoogle: (nextPath?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  user: User | null;
};

function friendlyCloudErrorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const obj = e as { code?: string; message?: string; details?: string };
    if (obj.code === "PGRST205") {
      return "Cloud table `public.charts` is missing. Run `supabase/charts.sql` in the Supabase SQL Editor (and retry).";
    }
    if (obj.code === "PGRST301" || obj.code === "42501") {
      return "Cloud sync was rejected by row-level security. Re-run `supabase/charts.sql` to recreate the policies.";
    }
    if (obj.message) {
      return obj.message;
    }
  }
  if (e instanceof Error) {
    return e.message;
  }
  return "Cloud sync failed. Check the browser console for details.";
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(() => Boolean(supabase));
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncNow = useCallback(async () => {
    if (!supabase || !user) {
      return null;
    }

    try {
      const summary = await syncChartsForUser(supabase, user.id);
      startTransition(() => {
        setLastSync(summary);
        setSyncError(null);
      });
      return summary;
    } catch (e) {
      const message = friendlyCloudErrorMessage(e);
      console.warn("[cloud sync] failed:", e);
      startTransition(() => setSyncError(message));
      return null;
    }
  }, [supabase, user]);

  const syncChart = useCallback(
    async (chartId: string) => {
      if (!supabase || !user) {
        return null;
      }

      try {
        const summary = await pushSingleChart(supabase, chartId, user.id);
        startTransition(() => {
          setLastSync(summary);
          setSyncError(null);
        });
        return summary;
      } catch (e) {
        const message = friendlyCloudErrorMessage(e);
        console.warn("[cloud sync] failed:", e);
        startTransition(() => setSyncError(message));
        return null;
      }
    },
    [supabase, user],
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setUser(data.user ?? null);
      setLoadingAuth(false);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      startTransition(() => {
        setUser(session?.user ?? null);
        setLoadingAuth(false);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user) {
      return;
    }

    void (async () => {
      await purgeChartsNotOwnedBy(user.id);
      await syncNow();
    })();

    const handleOnline = () => {
      void (async () => {
        await purgeChartsNotOwnedBy(user.id);
        await syncNow();
      })();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [supabase, syncNow, user]);

  useEffect(() => {
    if (!supabase || !user) {
      return;
    }

    let active = true;
    const channel = supabase
      .channel(`charts-sync-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "charts",
        },
        () => {
          if (active) {
            void syncNow();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chart_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          if (active) {
            void syncNow();
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, syncNow, user]);

  const value = useMemo<AppShellContextValue>(
    () => ({
      authEnabled: isSupabaseConfigured,
      loadingAuth,
      lastSync,
      syncError,
      supabase,
      syncNow,
      syncChart,
      async signInWithGoogle(nextPath = "/") {
        if (!supabase) {
          return "Supabase is not configured yet. Add the public environment variables to enable cloud sign-in.";
        }

        const safeNext =
          nextPath.startsWith("/") && !nextPath.startsWith("//")
            ? nextPath
            : "/";
        const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
          safeNext,
        )}`;

        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            queryParams: { prompt: "select_account" },
          },
        });

        return error?.message ?? null;
      },
      async signOut() {
        await supabase?.auth.signOut();
        setUser(null);
      },
      user,
    }),
    [lastSync, loadingAuth, supabase, syncChart, syncError, syncNow, user],
  );

  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const context = useContext(AppShellContext);

  if (!context) {
    throw new Error("useAppShell must be used inside AppShellProvider");
  }

  return context;
}
