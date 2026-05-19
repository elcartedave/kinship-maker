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
    <main>
      
      <nav id="navbar" className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 md:px-12 py-4 md:py-5 bg-cream/85 backdrop-blur-md border-b border-gold/15 transition-all duration-300">
        <a href="#" className="flex items-center gap-2.5 font-serif text-[22px] font-bold text-ink no-underline">
          <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="8" r="5" fill="#c9933a"/>
            <circle cx="6" cy="24" r="4" fill="#5a7a6a"/>
            <circle cx="26" cy="24" r="4" fill="#b85c38"/>
            <line x1="16" y1="13" x2="16" y2="18" stroke="#c9933a" stroke-width="1.5"/>
            <line x1="16" y1="18" x2="6" y2="20" stroke="#c9933a" stroke-width="1.5"/>
            <line x1="16" y1="18" x2="26" y2="20" stroke="#c9933a" stroke-width="1.5"/>
          </svg>
          Kin<span className="text-gold">ship</span>
        </a>
        <ul className="hidden md:flex gap-8 list-none">
          <li><a href="#features" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">Features</a></li>
          <li><a href="#how" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">How it works</a></li>
          <li><a href="#collab" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">Collaborate</a></li>
          <li><a href="#devs" className="text-sm font-medium text-slate no-underline tracking-wide transition-colors duration-200 hover:text-gold">Developers</a></li>
        </ul>
        <a href="#" className="px-[22px] py-2.5 rounded-lg bg-ink text-cream text-sm font-medium cursor-pointer border-none tracking-wide transition-all duration-250 no-underline inline-block hover:bg-gold hover:text-ink">Get Started Free</a>
      </nav>

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
              <a href="#" className="flex items-center gap-2.5 px-7 py-[15px] rounded-[10px] bg-ink text-cream font-sans text-[15px] font-semibold cursor-pointer border-none transition-all duration-300 no-underline shadow-[0_4px_20px_rgba(15,14,13,.2)] hover:bg-gold hover:text-ink hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(201,147,58,.3)]">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                Start for Free
              </a>
              <button className="flex items-center gap-2.5 px-6 py-[14px] rounded-[10px] bg-white text-ink font-sans text-[15px] font-medium cursor-pointer border-[1.5px] border-warm transition-all duration-250 no-underline shadow-[0_2px_12px_rgba(0,0,0,.06)] hover:border-mist hover:shadow-[0_4px_24px_rgba(0,0,0,.12)] hover:-translate-y-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
            </div>
            <p className="mt-2.5 text-xs text-[#8a8a8a] flex items-center gap-[5px]">
              <svg className="shrink-0" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#aaa" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
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
              <text x="70" y="40" text-anchor="middle" fill="#f7f4ef" font-size="10" font-family="DM Sans" font-weight="600">David M.</text>
              <text x="70" y="54" text-anchor="middle" fill="#c9933a" font-size="9" font-family="DM Sans">Grandfather</text>
              <rect x="130" y="20" width="80" height="48" rx="10" fill="#0f0e0d" opacity=".9"/>
              <text x="170" y="40" text-anchor="middle" fill="#f7f4ef" font-size="10" font-family="DM Sans" font-weight="600">Rose M.</text>
              <text x="170" y="54" text-anchor="middle" fill="#c9933a" font-size="9" font-family="DM Sans">Grandmother</text>
              <line x1="110" y1="44" x2="130" y2="44" stroke="#c9933a" stroke-width="2"/>
              <circle cx="120" cy="44" r="4" fill="#c9933a"/>
              <line x1="120" y1="68" x2="120" y2="90" stroke="#ddd" stroke-width="1.5" stroke-dasharray="4,3"/>
              <rect x="50" y="90" width="80" height="48" rx="10" fill="#5a7a6a"/>
              <text x="90" y="110" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">James M.</text>
              <text x="90" y="124" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="9" font-family="DM Sans">Father</text>
              <rect x="155" y="90" width="80" height="48" rx="10" fill="#5a7a6a"/>
              <text x="195" y="110" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">Laura K.</text>
              <text x="195" y="124" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="9" font-family="DM Sans">Mother</text>
              <rect x="265" y="90" width="80" height="48" rx="10" fill="#3d4f5c"/>
              <text x="305" y="110" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">Mark T.</text>
              <text x="305" y="124" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="9" font-family="DM Sans">Uncle</text>
              <line x1="130" y1="114" x2="155" y2="114" stroke="#c9933a" stroke-width="2"/>
              <circle cx="142" cy="114" r="4" fill="#c9933a"/>
              <line x1="142" y1="138" x2="142" y2="170" stroke="#ddd" stroke-width="1.5" stroke-dasharray="4,3"/>
              <rect x="60" y="170" width="80" height="48" rx="10" fill="#b85c38"/>
              <text x="100" y="190" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">Alex M.</text>
              <text x="100" y="204" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="9" font-family="DM Sans">Subject</text>
              <rect x="57" y="167" width="86" height="54" rx="12" fill="none" stroke="#c9933a" stroke-width="2" opacity=".6"/>
              <rect x="165" y="170" width="80" height="48" rx="10" fill="#7c6b5a"/>
              <text x="205" y="190" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">Nina M.</text>
              <text x="205" y="204" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="9" font-family="DM Sans">Sister</text>
              <rect x="260" y="170" width="80" height="48" rx="10" fill="#7c6b5a"/>
              <text x="300" y="190" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">Tom M.</text>
              <text x="300" y="204" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="9" font-family="DM Sans">Brother</text>
              <line x1="142" y1="170" x2="100" y2="170" stroke="#ddd" stroke-width="1.5"/>
              <line x1="142" y1="170" x2="205" y2="170" stroke="#ddd" stroke-width="1.5"/>
              <line x1="142" y1="170" x2="300" y2="170" stroke="#ddd" stroke-width="1.5"/>
            </svg>
          </div>
          <div className="absolute bottom-[-20px] left-[-24px] bg-white border border-warm rounded-[10px] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.1)] text-xs font-semibold flex items-center gap-2 text-sage">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#5a7a6a" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            3 collaborators online
          </div>
          <div className="absolute top-[24px] right-[-24px] bg-white border border-warm rounded-[10px] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,.1)] text-xs font-semibold flex items-center gap-2 text-rust">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#b85c38" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDF / PNG ready
          </div>
        </div>
      </section>

      <div className="bg-white border-y border-warm px-6 md:px-12 py-5 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 overflow-hidden">
        <span className="text-xs text-[#aaa] font-medium whitespace-nowrap tracking-[0.06em] uppercase">Trusted by professionals at</span>
        <div className="flex gap-6 md:gap-10 items-center justify-center flex-wrap">
          <span className="text-sm font-semibold text-[#bbb] tracking-[0.04em]">SOCIAL WORK TODAY</span>
          <span className="text-sm font-semibold text-[#bbb] tracking-[0.04em]">FAMILY COURT SERVICES</span>
          <span className="text-sm font-semibold text-[#bbb] tracking-[0.04em]">GENEALOGY PRO</span>
          <span className="text-sm font-semibold text-[#bbb] tracking-[0.04em]">CASE BRIDGE</span>
          <span className="text-sm font-semibold text-[#bbb] tracking-[0.04em]">HERITAGE CONNECT</span>
        </div>
      </div>

      <section className="px-6 md:px-12 py-16 md:py-[96px]" id="features">
        <div className="max-w-[1100px] mx-auto">
          <span className="inline-block text-xs font-bold text-gold tracking-[0.1em] uppercase mb-4">Why Kinship</span>
          <h2 className="font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em] mb-4">Everything you need to document family connections</h2>
          <p className="text-[17px] text-slate leading-[1.65] max-w-[560px] mb-16">Purpose-built for social workers, family researchers, and anyone who needs to map complex relationships clearly and professionally.</p>

          <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
            <div className="fade-element opacity-0 translate-y-[30px] transition-all duration-700 ease-out bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]">🌐</div>
                <h3 className="font-serif text-[20px] font-bold mb-3">Works Everywhere</h3>
                <p className="text-sm text-slate leading-[1.7]">Full-featured online and offline. Your diagrams sync automatically when you reconnect — no data ever lost, no interruptions to your workflow.</p>
              </div>
            </div>
            <div className="fade-element opacity-0 translate-y-[30px] transition-all duration-700 ease-out delay-100 bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]">📤</div>
                <h3 className="font-serif text-[20px] font-bold mb-3">Export-Ready Output</h3>
                <p className="text-sm text-slate leading-[1.7]">Export professional-quality PDFs, PNGs, and SVGs in one click. Court-ready, print-ready, and share-ready from day one.</p>
              </div>
            </div>
            <div className="fade-element opacity-0 translate-y-[30px] transition-all duration-700 ease-out delay-200 bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]">🤝</div>
                <h3 className="font-serif text-[20px] font-bold mb-3">Real-Time Collaboration</h3>
                <p className="text-sm text-slate leading-[1.7]">Invite colleagues via Google account to co-edit diagrams simultaneously. See live cursors, comments, and changes as they happen.</p>
              </div>
            </div>
            <div className="fade-element opacity-0 translate-y-[30px] transition-all duration-700 ease-out delay-300 bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]">🔒</div>
                <h3 className="font-serif text-[20px] font-bold mb-3">Privacy-First Design</h3>
                <p className="text-sm text-slate leading-[1.7]">Your data stays yours. Google login is used only for cloud sync — never for analytics, advertising, or third-party sharing.</p>
              </div>
            </div>
            <div className="fade-element opacity-0 translate-y-[30px] transition-all duration-700 ease-out delay-100 bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]">⚡</div>
                <h3 className="font-serif text-[20px] font-bold mb-3">Built for Speed</h3>
                <p className="text-sm text-slate leading-[1.7]">Drag-and-drop nodes, smart relationship inference, and auto-layout algorithms so you can map even complex families in minutes.</p>
              </div>
            </div>
            <div className="fade-element opacity-0 translate-y-[30px] transition-all duration-700 ease-out delay-200 bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]">📋</div>
                <h3 className="font-serif text-[20px] font-bold mb-3">Professional Templates</h3>
                <p className="text-sm text-slate leading-[1.7]">Genogram, ecomap, and sociogram templates following NASW standards. Start from scratch or adapt a template to your case.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ink text-cream px-6 md:px-12 py-16 md:py-[96px]" id="how">
        <div className="max-w-[1100px] mx-auto">
          <span className="inline-block text-xs font-bold text-gold-light tracking-[0.1em] uppercase mb-4">How it works</span>
          <h2 className="font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em] mb-4 text-cream">From blank canvas to shareable diagram in 4 steps</h2>
          <p className="text-[17px] text-cream/60 leading-[1.65] max-w-[560px] mb-16">A workflow designed to stay out of your way so you can focus on the people, not the software.</p>

          <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-0">
            <div className="p-8 md:px-8 md:py-10 border-b md:border-b-0 md:border-r border-white/10 relative">
              <div className="font-serif text-[56px] font-black text-gold/20 leading-none mb-4">01</div>
              <h3 className="text-[17px] font-semibold mb-2.5 text-cream">Create or Upload</h3>
              <p className="text-sm text-cream/55 leading-[1.7]">Start a new diagram or import existing data from CSV. Choose a template or begin from a blank canvas.</p>
              <div className="hidden md:block absolute top-[56px] right-[-20px] w-10 h-0.5 bg-gradient-to-r from-gold/40 to-transparent z-10"></div>
            </div>
            <div className="p-8 md:px-8 md:py-10 border-b md:border-b-0 md:border-r border-white/10 relative">
              <div className="font-serif text-[56px] font-black text-gold/20 leading-none mb-4">02</div>
              <h3 className="text-[17px] font-semibold mb-2.5 text-cream">Add People & Relationships</h3>
              <p className="text-sm text-cream/55 leading-[1.7]">Drag nodes onto the canvas, define relationships with a click. Smart suggestions help you build faster.</p>
              <div className="hidden md:block absolute top-[56px] right-[-20px] w-10 h-0.5 bg-gradient-to-r from-gold/40 to-transparent z-10"></div>
            </div>
            <div className="p-8 md:px-8 md:py-10 border-b md:border-b-0 md:border-r border-white/10 relative">
              <div className="font-serif text-[56px] font-black text-gold/20 leading-none mb-4">03</div>
              <h3 className="text-[17px] font-semibold mb-2.5 text-cream">Invite Collaborators</h3>
              <p className="text-sm text-cream/55 leading-[1.7]">Share a link or invite via Google account. Collaborators can view or edit depending on the permission level you set.</p>
              <div className="hidden md:block absolute top-[56px] right-[-20px] w-10 h-0.5 bg-gradient-to-r from-gold/40 to-transparent z-10"></div>
            </div>
            <div className="p-8 md:px-8 md:py-10 relative">
              <div className="font-serif text-[56px] font-black text-gold/20 leading-none mb-4">04</div>
              <h3 className="text-[17px] font-semibold mb-2.5 text-cream">Export & Share</h3>
              <p className="text-sm text-cream/55 leading-[1.7]">Download as PDF, PNG, or SVG. Or share a live link that always reflects the latest version of your diagram.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 md:px-12 py-16 md:py-[96px]">
        <div className="max-w-[1100px] mx-auto">
          <span className="inline-block text-xs font-bold text-gold tracking-[0.1em] uppercase mb-4">Features in focus</span>
          <h2 className="font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em]">Designed for every scenario</h2>

          <div className="relative overflow-hidden rounded-[20px] mt-12">
            <div className="flex transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]" id="track">

              <div className="min-w-full grid grid-cols-1 md:grid-cols-2 items-stretch bg-cream rounded-[20px] overflow-hidden border border-warm">
                <div className="p-10 md:py-14 md:px-12 flex flex-col justify-center">
                  <span className="self-start inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.08em] uppercase mb-5 bg-gold/12 text-gold">Offline Mode</span>
                  <h3 className="font-serif text-[32px] font-extrabold mb-4 leading-[1.15]">Keep Working, Even Without Wi-Fi</h3>
                  <p className="text-[15px] text-slate leading-[1.7] max-w-[360px]">Kinship stores your entire workspace locally. Work on planes, in remote areas, or during outages. Every change syncs automatically when you reconnect.</p>
                </div>
                <div className="bg-ink flex items-center justify-center min-h-[220px] md:min-h-[360px] p-10 relative overflow-hidden">
                  <div className="absolute w-[300px] h-[300px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(201,147,58,.15)_0%,transparent_70%)]"></div>
                  <svg width="220" height="180" viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
                    <rect x="70" y="20" width="80" height="40" rx="8" fill="#c9933a" opacity=".9"/>
                    <text x="110" y="36" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">Offline</text>
                    <text x="110" y="50" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="9" font-family="DM Sans">All changes saved</text>
                    <line x1="110" y1="60" x2="110" y2="90" stroke="rgba(255,255,255,.3)" stroke-width="1.5" stroke-dasharray="4,3"/>
                    <rect x="20" y="90" width="70" height="36" rx="7" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
                    <text x="55" y="112" text-anchor="middle" fill="rgba(255,255,255,.8)" font-size="9" font-family="DM Sans">Node A</text>
                    <rect x="130" y="90" width="70" height="36" rx="7" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
                    <text x="165" y="112" text-anchor="middle" fill="rgba(255,255,255,.8)" font-size="9" font-family="DM Sans">Node B</text>
                    <circle cx="110" cy="155" r="16" fill="rgba(201,147,58,.2)" stroke="#c9933a" stroke-width="1.5"/>
                    <text x="110" y="160" text-anchor="middle" font-size="14">📶</text>
                    <line x1="98" y1="143" x2="122" y2="167" stroke="#c9933a" stroke-width="2"/>
                  </svg>
                </div>
              </div>

              <div className="min-w-full grid grid-cols-1 md:grid-cols-2 items-stretch bg-cream rounded-[20px] overflow-hidden border border-warm">
                <div className="p-10 md:py-14 md:px-12 flex flex-col justify-center">
                  <span className="self-start inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.08em] uppercase mb-5 bg-sage/12 text-sage">Collaboration</span>
                  <h3 className="font-serif text-[32px] font-extrabold mb-4 leading-[1.15]">Share Diagrams Across Your Team</h3>
                  <p className="text-[15px] text-slate leading-[1.7] max-w-[360px]">Connect units through shared Google accounts. Invite family members, social workers, or attorneys to view or co-edit — with granular permission controls.</p>
                </div>
                <div className="bg-ink flex items-center justify-center min-h-[220px] md:min-h-[360px] p-10 relative overflow-hidden">
                  <div className="absolute w-[300px] h-[300px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(201,147,58,.15)_0%,transparent_70%)]"></div>
                  <svg width="240" height="180" viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
                    <circle cx="60" cy="60" r="22" fill="#5a7a6a"/>
                    <text x="60" y="65" text-anchor="middle" fill="#fff" font-size="16">A</text>
                    <rect x="80" y="48" width="60" height="20" rx="4" fill="rgba(90,122,106,.3)" stroke="#5a7a6a" stroke-width="1"/>
                    <text x="110" y="62" text-anchor="middle" fill="#5a7a6a" font-size="9" font-family="DM Sans" font-weight="600">Editing...</text>
                    <circle cx="180" cy="120" r="22" fill="#c9933a"/>
                    <text x="180" y="125" text-anchor="middle" fill="#fff" font-size="16">B</text>
                    <rect x="140" y="108" width="60" height="20" rx="4" fill="rgba(201,147,58,.3)" stroke="#c9933a" stroke-width="1"/>
                    <text x="170" y="122" text-anchor="middle" fill="#c9933a" font-size="9" font-family="DM Sans" font-weight="600">Viewing</text>
                    <rect x="90" y="78" width="60" height="32" rx="8" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/>
                    <text x="120" y="99" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans">Subject</text>
                    <line x1="80" y1="75" x2="100" y2="88" stroke="rgba(90,122,106,.6)" stroke-width="1.5"/>
                    <line x1="155" y1="105" x2="145" y2="100" stroke="rgba(201,147,58,.6)" stroke-width="1.5"/>
                  </svg>
                </div>
              </div>

              <div className="min-w-full grid grid-cols-1 md:grid-cols-2 items-stretch bg-cream rounded-[20px] overflow-hidden border border-warm">
                <div className="p-10 md:py-14 md:px-12 flex flex-col justify-center">
                  <span className="self-start inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.08em] uppercase mb-5 bg-rust/12 text-rust">Export</span>
                  <h3 className="font-serif text-[32px] font-extrabold mb-4 leading-[1.15]">Professional Output, Every Time</h3>
                  <p className="text-[15px] text-slate leading-[1.7] max-w-[360px]">Export crisp, print-ready PDFs with proper margins and labels. PNGs for presentations. SVGs for further design work. Or share a live URL that never goes stale.</p>
                </div>
                <div className="bg-ink flex items-center justify-center min-h-[220px] md:min-h-[360px] p-10 relative overflow-hidden">
                  <div className="absolute w-[300px] h-[300px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(201,147,58,.15)_0%,transparent_70%)]"></div>
                  <svg width="220" height="180" viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
                    <rect x="65" y="20" width="90" height="110" rx="8" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/>
                    <rect x="75" y="35" width="55" height="6" rx="3" fill="rgba(255,255,255,.4)"/>
                    <rect x="75" y="48" width="70" height="5" rx="2.5" fill="rgba(255,255,255,.2)"/>
                    <rect x="75" y="60" width="60" height="5" rx="2.5" fill="rgba(255,255,255,.2)"/>
                    <rect x="75" y="72" width="65" height="5" rx="2.5" fill="rgba(255,255,255,.2)"/>
                    <text x="110" y="106" text-anchor="middle" fill="rgba(255,255,255,.5)" font-size="9" font-family="DM Sans">PDF</text>
                    <path d="M110 140 L110 155 M104 149 L110 155 L116 149" stroke="#b85c38" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                    <rect x="70" y="155" width="80" height="18" rx="5" fill="#b85c38" opacity=".9"/>
                    <text x="110" y="168" text-anchor="middle" fill="#fff" font-size="10" font-family="DM Sans" font-weight="600">Download</text>
                  </svg>
                </div>
              </div>

            </div>
          </div>

          <div className="flex justify-center gap-3 mt-4">
            <button className="w-11 h-11 rounded-full border-[1.5px] border-warm bg-white flex items-center justify-center cursor-pointer transition-all duration-250 text-ink text-lg hover:bg-ink hover:text-cream hover:border-ink">←</button>
            <button className="w-11 h-11 rounded-full border-[1.5px] border-warm bg-white flex items-center justify-center cursor-pointer transition-all duration-250 text-ink text-lg hover:bg-ink hover:text-cream hover:border-ink">→</button>
          </div>
          <div className="flex justify-center gap-2 mt-6" id="dots">
            <button className="cdot w-6 h-2 rounded-md bg-gold cursor-pointer transition-all duration-300 border-none"></button>
            <button className="cdot w-2 h-2 rounded-full bg-warm cursor-pointer transition-all duration-300 border-none"></button>
            <button className="cdot w-2 h-2 rounded-full bg-warm cursor-pointer transition-all duration-300 border-none"></button>
          </div>
        </div>
      </section>

      <section className="px-6 md:px-12 py-16 md:py-[96px] bg-gradient-to-br from-[#f7f4ef] to-[#ede6da]" id="collab">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <span className="inline-block text-xs font-bold text-gold tracking-[0.1em] uppercase mb-4">Collaboration</span>
            <h2 className="font-serif text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em] mb-4">Connect units, share diagrams, work together</h2>
            <p className="text-[16px] text-slate leading-[1.7] mb-8">
              When multiple practitioners are working on related family cases, Kinship lets you connect their diagram units through a shared Google account. Everyone stays in sync — changes propagate in real time, and permissions keep sensitive data safe.
            </p>
            <ul className="list-none flex flex-col gap-3.5">
              <li className="flex gap-3 items-start">
                <span className="w-5.5 h-5.5 rounded-full bg-sage flex items-center justify-center shrink-0 text-white text-xs mt-0.5 px-[6px] py-[3px]">✓</span>
                <span className="text-[15px] text-slate leading-[1.6]">Invite collaborators by Google email — no separate account needed</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-5.5 h-5.5 rounded-full bg-sage flex items-center justify-center shrink-0 text-white text-xs mt-0.5 px-[6px] py-[3px]">✓</span>
                <span className="text-[15px] text-slate leading-[1.6]">Set view-only or edit access per person or per diagram unit</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-5.5 h-5.5 rounded-full bg-sage flex items-center justify-center shrink-0 text-white text-xs mt-0.5 px-[6px] py-[3px]">✓</span>
                <span className="text-[15px] text-slate leading-[1.6]">Live presence indicators show who's viewing or editing right now</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-5.5 h-5.5 rounded-full bg-sage flex items-center justify-center shrink-0 text-white text-xs mt-0.5 px-[6px] py-[3px]">✓</span>
                <span className="text-[15px] text-slate leading-[1.6]">Full change history with per-user attribution for audit trails</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-6 items-center bg-white rounded-[20px] p-10 border border-warm shadow-[0_12px_48px_rgba(0,0,0,.07)]">
            <div className="text-center">
              <p className="text-[13px] text-[#aaa] font-semibold tracking-[0.06em] uppercase mb-4">Currently Collaborating</p>
              <div className="flex justify-center mb-4">
                <div className="w-11 h-11 rounded-full border-4 border-white flex items-center justify-center text-base font-bold text-white bg-sage -ml-2 first:ml-0">J</div>
                <div className="w-11 h-11 rounded-full border-4 border-white flex items-center justify-center text-base font-bold text-white bg-gold -ml-2 first:ml-0">R</div>
                <div className="w-11 h-11 rounded-full border-4 border-white flex items-center justify-center text-base font-bold text-white bg-rust -ml-2 first:ml-0">M</div>
                <div className="w-11 h-11 rounded-full border-4 border-white flex items-center justify-center text-base font-bold text-white bg-slate -ml-2 first:ml-0">S</div>
                <div className="w-11 h-11 rounded-full border-4 border-white flex items-center justify-center text-base font-bold text-white bg-[#7c6b5a] -ml-2 first:ml-0">+2</div>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-slate justify-center">
                <div className="w-2 h-2 rounded-full bg-[#4caf7d] animate-pulse-fast"></div>
                <span>5 people are online now</span>
              </div>
            </div>

            <div className="bg-cream rounded-xl p-5 w-full border border-warm">
              <p className="text-[11px] font-bold text-[#aaa] uppercase tracking-[0.08em] mb-3">Share this diagram</p>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2 rounded-lg border border-warm bg-white text-[13px] text-slate font-mono outline-none" value="kinship.app/d/fam-2024-miller" />
                <button className="px-4 py-2 rounded-lg bg-gold text-white text-[13px] font-semibold cursor-pointer transition-colors whitespace-nowrap hover:bg-rust">Copy</button>
              </div>
            </div>

            <div className="bg-sage/10 border border-sage/20 rounded-[10px] py-4 px-5 w-full">
              <p className="text-[12px] text-sage font-semibold mb-1.5">🔗 Connected to: Miller Case Unit</p>
              <p className="text-[13px] text-slate">Diagrams in this unit automatically share structural updates while keeping personal notes private.</p>
            </div>
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
            <button className="flex items-center gap-2.5 px-8 py-4 rounded-[10px] bg-cream text-ink font-sans text-[15px] font-semibold cursor-pointer border-none transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,.3)] hover:bg-gold hover:-translate-y-0.5">
              Start for Free →
            </button>
            <button className="flex items-center gap-2.5 px-7 py-[15px] rounded-[10px] bg-transparent text-cream font-sans text-[15px] font-medium cursor-pointer border-[1.5px] border-white/20 transition-all duration-300 hover:border-gold-light hover:text-gold-light">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </div>
          <p className="mt-5 text-[13px] text-cream/35">
            🔒 Google is used only for syncing & sharing — never for ads.
          </p>
        </div>
      </section>

      <footer className="bg-[#080807] text-cream/40 px-6 md:px-12 py-8 md:py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-center">
        <span className="font-serif text-base text-cream/60 font-bold">Kinship</span>
        <div className="flex gap-6 justify-center">
          <a href="#" className="text-cream/40 no-underline text-[13px] hover:text-gold-light transition-colors">Privacy</a>
          <a href="#" className="text-cream/40 no-underline text-[13px] hover:text-gold-light transition-colors">Terms</a>
          <a href="#" className="text-cream/40 no-underline text-[13px] hover:text-gold-light transition-colors">Support</a>
          <a href="#" className="text-cream/40 no-underline text-[13px] hover:text-gold-light transition-colors">Changelog</a>
        </div>
        <span className="text-[13px]">© 2025 Kinship. All rights reserved.</span>
      </footer>

      <div id="modal" className="hidden fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm items-center justify-center opacity-0 transition-opacity duration-200">
        <div className="bg-white rounded-[20px] p-12 max-w-[420px] w-[90%] text-center shadow-[0_32px_80px_rgba(0,0,0,.2)] relative">
          <button className="absolute top-4 right-4 border-none bg-none text-xl cursor-pointer text-[#aaa] hover:text-ink transition-colors">×</button>
          <div className="w-14 h-14 rounded-xl bg-cream flex items-center justify-center mx-auto mb-5 text-[26px]">🌳</div>
          <h3 className="font-serif text-[24px] mb-2 text-ink">Sign in to Kinship</h3>
          <p className="text-[14px] text-slate mb-7 leading-[1.6]">Google login enables cloud sync and sharing only — your diagrams remain private and are never shared with Google.</p>
          <button className="flex items-center gap-3 w-full justify-center px-6 py-3.5 rounded-[10px] border-[1.5px] border-[#e0e0e0] bg-white font-sans text-[15px] font-medium cursor-pointer mb-4 transition-all duration-200 hover:bg-gray-50">
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <p className="text-[12px] text-[#aaa]">By continuing, you agree to our <a href="#" className="text-gold hover:underline">Terms</a> and <a href="#" className="text-gold hover:underline">Privacy Policy</a>.</p>
        </div>
      </div>

      <div id="dashboard" className="hidden fixed inset-0 z-[1001] bg-cream overflow-y-auto">
        <div className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-warm bg-white">
          <span className="font-serif text-[22px] font-bold">Kin<span className="text-gold">ship</span></span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate">
              <div className="w-8 h-8 rounded-full bg-sage flex items-center justify-center text-white font-bold text-[13px]">Y</div>
              <span className="hidden md:inline">You're signed in</span>
            </div>
            <button className="px-4.5 py-2 rounded-lg border-[1.5px] border-warm bg-transparent text-sm cursor-pointer font-sans hover:bg-gray-50 transition-colors">← Back</button>
          </div>
        </div>

        <div className="max-w-[1100px] mx-auto p-6 md:p-12">
          <h2 className="font-serif text-[36px] font-extrabold mb-2">Welcome back 👋</h2>
          <p className="text-slate mb-12 text-[16px]">Your cloud diagrams are synced. Here's what you're working on.</p>

          <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-[#aaa] mb-5">Recent Diagrams</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 mb-12">
            <div className="bg-white border border-warm rounded-2xl p-6 cursor-pointer transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,.08)]">
              <div className="bg-ink rounded-xl h-[100px] mb-4 flex items-center justify-center">
                <svg width="120" height="70" viewBox="0 0 120 70"><rect x="40" y="5" width="40" height="20" rx="5" fill="#c9933a" opacity=".9"/><rect x="10" y="40" width="35" height="18" rx="4" fill="#5a7a6a"/><rect x="75" y="40" width="35" height="18" rx="4" fill="#5a7a6a"/><line x1="60" y1="25" x2="60" y2="40" stroke="#ddd" stroke-width="1.5"/><line x1="27" y1="40" x2="60" y2="38" stroke="#ddd" stroke-width="1.5"/><line x1="92" y1="40" x2="60" y2="38" stroke="#ddd" stroke-width="1.5"/></svg>
              </div>
              <p className="font-bold mb-1">Miller Family Case</p>
              <p className="text-[13px] text-[#aaa]">Edited 2 hours ago · 3 collaborators</p>
            </div>
            <div className="bg-white border border-warm rounded-2xl p-6 cursor-pointer transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,.08)]">
              <div className="bg-slate rounded-xl h-[100px] mb-4 flex items-center justify-center">
                <svg width="120" height="70" viewBox="0 0 120 70"><rect x="42" y="5" width="36" height="18" rx="4" fill="#b85c38"/><rect x="5" y="42" width="32" height="16" rx="4" fill="rgba(255,255,255,.3)"/><rect x="44" y="42" width="32" height="16" rx="4" fill="rgba(255,255,255,.3)"/><rect x="83" y="42" width="32" height="16" rx="4" fill="rgba(255,255,255,.3)"/><line x1="60" y1="23" x2="60" y2="42" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/><line x1="21" y1="42" x2="60" y2="40" stroke="rgba(255,255,255,.3)" stroke-width="1"/><line x1="60" y1="40" x2="99" y2="42" stroke="rgba(255,255,255,.3)" stroke-width="1"/></svg>
              </div>
              <p className="font-bold mb-1">Torres Genogram</p>
              <p className="text-[13px] text-[#aaa]">Edited yesterday · You only</p>
            </div>
            <div className="bg-transparent border-2 border-dashed border-warm rounded-2xl p-6 cursor-pointer flex flex-col items-center justify-center min-h-[180px] transition-all duration-250 hover:border-gold group">
              <div className="w-10 h-10 rounded-xl bg-warm flex items-center justify-center text-xl mb-3 text-slate group-hover:bg-gold/20 group-hover:text-gold transition-colors">+</div>
              <p className="font-semibold text-slate group-hover:text-gold transition-colors">New Diagram</p>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            <div className="bg-white border border-warm rounded-xl p-5 md:px-6">
              <p className="text-[28px] font-serif font-extrabold text-ink">12</p>
              <p className="text-[13px] text-slate">Total diagrams</p>
            </div>
            <div className="bg-white border border-warm rounded-xl p-5 md:px-6">
              <p className="text-[28px] font-serif font-extrabold text-sage">4</p>
              <p className="text-[13px] text-slate">Collaborators</p>
            </div>
            <div className="bg-white border border-warm rounded-xl p-5 md:px-6">
              <p className="text-[28px] font-serif font-extrabold text-rust">8</p>
              <p className="text-[13px] text-slate">Exports this month</p>
            </div>
            <div className="bg-white border border-warm rounded-xl p-5 md:px-6">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#4caf7d] animate-pulse-fast"></div>
                <p className="text-[28px] font-serif font-extrabold text-gold">Synced</p>
              </div>
              <p className="text-[13px] text-slate">Cloud status</p>
            </div>
          </div>
        </div>
      </div>

    </main>
    // <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
    //   <section className="paper-panel overflow-hidden rounded-[2rem]">
    //     <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.85fr] lg:p-10">
    //       <div className="space-y-5">
    //         <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent-strong">
    //           Offline-first kinship chart studio
    //         </p>
    //         <div className="space-y-4">
    //           <h1 className="font-display max-w-3xl text-4xl leading-tight text-ink sm:text-5xl lg:text-6xl">
    //             {APP_NAME} keeps your charts alive online, offline, and ready to
    //             export.
    //           </h1>
    //           <p className="max-w-2xl text-base leading-8 text-ink-soft sm:text-lg">
    //             Drag kinship symbols onto an infinite canvas, connect them with
    //             relationship lines, autosave locally, and export exactly around
    //             the chart you placed.
    //           </p>
    //         </div>
    //         <div className="flex flex-wrap gap-3">
    //           {(!authEnabled || user) ? (
    //             <>
    //               <button
    //                 type="button"
    //                 onClick={() => void handleCreateChart()}
    //                 disabled={busyAction === "new"}
    //                 className="rounded-full bg-accent px-5 py-3 font-semibold text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-70"
    //               >
    //                 {busyAction === "new" ? "Creating..." : "New chart"}
    //               </button>
    //               <button
    //                 type="button"
    //                 onClick={() => void handleCreateSample()}
    //                 disabled={busyAction === "sample"}
    //                 className="rounded-full border border-line bg-white/70 px-5 py-3 font-semibold text-ink transition hover:border-accent/40 hover:bg-white"
    //               >
    //                 {busyAction === "sample"
    //                   ? "Loading sample..."
    //                   : "Load sample chart"}
    //               </button>
    //             </>
    //           ) : (
    //             <p className="max-w-md rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm leading-6 text-ink-soft">
    //               Sign in with Google (in the cloud panel) to create a new chart
    //               or open the sample diagram.
    //             </p>
    //           )}
    //           <InstallButton className="rounded-full border border-line bg-white/70 px-5 py-3 font-semibold text-ink transition hover:border-accent/40 hover:bg-white" />
    //         </div>
    //         <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
    //           <span className="rounded-full bg-white/80 px-3 py-1">
    //             Infinite canvas
    //           </span>
    //           <span className="rounded-full bg-white/80 px-3 py-1">
    //             Cropped PNG and PDF
    //           </span>
    //           <span className="rounded-full bg-white/80 px-3 py-1">
    //             Local autosave
    //           </span>
    //         </div>
    //       </div>

    //       <aside className="paper-grid rounded-[1.75rem] border border-line/80 bg-panel-strong/90 p-5 sm:p-6">
    //         <div className="space-y-5">
    //           <div>
    //             <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
    //               Cloud status
    //             </p>
    //             <p className="mt-3 text-sm leading-7 text-ink-soft">{cloudLabel}</p>
    //           </div>

    //           {authEnabled ? (
    //             user ? (
    //               <div className="space-y-3 rounded-[1.5rem] border border-line bg-white/80 p-4">
    //                 <p className="text-sm font-semibold text-ink">{user.email}</p>
    //                 <div className="flex flex-wrap gap-2">
    //                 <button
    //                   type="button"
    //                   onClick={() =>
    //                     void syncNow().then(() => {
    //                       void loadCharts();
    //                     })
    //                   }
    //                     className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
    //                   >
    //                     Sync now
    //                   </button>
    //                   <button
    //                     type="button"
    //                     onClick={() => void signOut()}
    //                     className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 hover:bg-white"
    //                   >
    //                     Sign out
    //                   </button>
    //                 </div>
    //               </div>
    //             ) : (
    //               <div className="space-y-3 rounded-[1.5rem] border border-line bg-white/80 p-4">
    //                 <p className="text-sm font-semibold text-ink">
    //                   Sign in to sync to the cloud
    //                 </p>
    //                 <p className="text-xs leading-5 text-ink-soft">
    //                   We use your Google account so only you can create, open,
    //                   and delete your charts. They are stored in your private
    //                   cloud and cached on this device while you edit.
    //                 </p>
    //                 <button
    //                   type="button"
    //                   onClick={() => void handleGoogleSignIn()}
    //                   disabled={busyAction === "auth"}
    //                   className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm transition hover:border-accent/40 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
    //                 >
    //                   <svg
    //                     width="18"
    //                     height="18"
    //                     viewBox="0 0 18 18"
    //                     aria-hidden="true"
    //                   >
    //                     <path
    //                       fill="#4285F4"
    //                       d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.61z"
    //                     />
    //                     <path
    //                       fill="#34A853"
    //                       d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
    //                     />
    //                     <path
    //                       fill="#FBBC05"
    //                       d="M3.97 10.71a5.4 5.4 0 0 1 0-3.43V4.96H.96a9 9 0 0 0 0 8.07l3.01-2.32z"
    //                     />
    //                     <path
    //                       fill="#EA4335"
    //                       d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A9 9 0 0 0 .96 4.96l3.01 2.32C4.69 5.16 6.66 3.58 9 3.58z"
    //                     />
    //                   </svg>
    //                   {busyAction === "auth"
    //                     ? "Redirecting to Google…"
    //                     : "Continue with Google"}
    //                 </button>
    //               </div>
    //             )
    //           ) : (
    //             <div className="rounded-[1.5rem] border border-dashed border-line bg-white/70 p-4 text-sm leading-7 text-ink-soft">
    //               Add `NEXT_PUBLIC_SUPABASE_URL` and either
    //               `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or
    //               `NEXT_PUBLIC_SUPABASE_ANON_KEY` to turn on private cloud sync.
    //             </div>
    //           )}

    //           {feedback ? (
    //             <p className="rounded-[1.25rem] bg-white/70 px-4 py-3 text-sm leading-6 text-ink-soft">
    //               {feedback}
    //             </p>
    //           ) : null}

    //           {syncError ? (
    //             <p className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
    //               Cloud sync failed: {syncError}
    //             </p>
    //           ) : null}
    //         </div>
    //       </aside>
    //     </div>
    //   </section>

    //   <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
    //     <div className="space-y-4">
    //       <div className="flex items-end justify-between gap-4">
    //         <div>
    //           <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
    //             Recent charts
    //           </p>
    //           <h2 className="font-display mt-2 text-3xl text-ink">
    //             Pick up where you left off
    //           </h2>
    //         </div>
    //         {authEnabled && !user ? null : (
    //           <p className="text-sm text-ink-soft">
    //             {charts.length} {charts.length === 1 ? "chart" : "charts"}
    //           </p>
    //         )}
    //       </div>

    //       {authEnabled && loadingAuth ? (
    //         <div className="paper-panel rounded-[1.75rem] p-8 text-center">
    //           <p className="text-sm text-ink-soft">Loading your charts…</p>
    //         </div>
    //       ) : authEnabled && !user ? (
    //         <div className="paper-panel rounded-[1.75rem] p-8 text-center">
    //           <p className="text-lg font-semibold text-ink">Sign in to see charts</p>
    //           <p className="mt-3 text-sm leading-7 text-ink-soft">
    //             Your charts are tied to your Google account. Use{" "}
    //             <strong>Continue with Google</strong> in the cloud panel above,
    //             then return here to open or delete them.
    //           </p>
    //         </div>
    //       ) : charts.length === 0 ? (
    //         <div className="paper-panel rounded-[1.75rem] p-8 text-center">
    //           <p className="text-lg font-semibold text-ink">No charts yet</p>
    //           <p className="mt-3 text-sm leading-7 text-ink-soft">
    //             Start a blank chart or load the sample diagram to get the symbol
    //             library and exports moving right away.
    //           </p>
    //         </div>
    //       ) : (
    //         <div className="grid gap-4 xl:grid-cols-2">
    //           {charts.map((chart) => (
    //             <article
    //               key={chart.id}
    //               className="paper-panel rounded-[1.75rem] p-5 transition hover:-translate-y-0.5"
    //             >
    //               <div className="flex items-start justify-between gap-4">
    //                 <div className="min-w-0">
    //                   <Link
    //                     href={`/charts/${chart.id}`}
    //                     className="font-display line-clamp-2 text-2xl text-ink"
    //                   >
    //                     {chart.title}
    //                   </Link>
    //                   <p className="mt-2 text-sm text-ink-soft">
    //                     Updated {formatUpdatedAt(chart.updatedAt)}
    //                   </p>
    //                 </div>
    //                 <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
    //                   <span className="rounded-full bg-white/80 px-3 py-2">
    //                     {authEnabled ? "Your chart" : chart.ownerId ? "Cloud-ready" : "Local"}
    //                   </span>
    //                   {chart.dirty ? (
    //                     <span className="rounded-full bg-amber-100 px-3 py-2 text-amber-800">
    //                       Pending save
    //                     </span>
    //                   ) : null}
    //                 </div>
    //               </div>

    //               <div className="mt-5 flex flex-wrap gap-2">
    //                 <Link
    //                   href={`/charts/${chart.id}`}
    //                   className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
    //                 >
    //                   Open editor
    //                 </Link>
    //                 <button
    //                   type="button"
    //                   onClick={() => void handleDelete(chart.id)}
    //                   disabled={busyAction === chart.id}
    //                   className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 hover:bg-white disabled:cursor-wait disabled:opacity-60"
    //                 >
    //                   {busyAction === chart.id ? "Deleting..." : "Delete"}
    //                 </button>
    //               </div>
    //             </article>
    //           ))}
    //         </div>
    //       )}
    //     </div>

    //     <aside className="paper-panel rounded-[1.75rem] p-5">
    //       <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-strong">
    //         Setup notes
    //       </p>
    //       <ul className="mt-4 space-y-3 text-sm leading-7 text-ink-soft">
    //         <li>Offline charts live in IndexedDB, so they reopen on the same device even without a network.</li>
    //         <li>Private cloud sync depends on Supabase auth and the `charts` table with row-level security.</li>
    //         <li>Sign-in uses Google OAuth via Supabase. Enable the Google provider in <strong>Auth → Providers</strong> and add your origin to the redirect allow-list.</li>
    //       </ul>
    //     </aside>
    //   </section>
    // </main>
  );
}
