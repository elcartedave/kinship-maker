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

      {/* CTA Action Button */}
      <a 
        href="#" 
        className="px-[22px] py-2.5 rounded-lg bg-ink !text-cream text-sm font-medium tracking-wide transition-all duration-200 no-underline inline-block hover:bg-gold hover:!text-ink"
      >
        Get Started Free
      </a>

    </nav>

      <section className="bg-cream min-h-screen grid grid-cols-1 md:grid-cols-2 items-center px-6 md:px-40 pt-[100px] md:pt-[120px] pb-[60px] md:pb-20 gap-6 md:gap-12 relative overflow-hidden">

        <div className="relative z-10">
          <h1 className="font-serif text-[clamp(42px,5vw,72px)] font-black leading-[1.05] tracking-[-0.02em] mb-6">Connect your kin with <em className="italic text-gold font-semibold">Kinnect</em></h1>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gold/12 border border-gold/30 text-s font-semibold text-gold tracking-[0.08em] uppercase mb-6">
            A SMART, AI-POWERED KINSHIP MAPPER
          </div>
          <p className="text-lg leading-[1.65] text-slate max-w-[480px] mb-10">Drag, connect, and map relationships on an infinite canvas. Autosave locally and export your chart exactly as you built it.</p>

          <div>
            <div className="flex gap-4 items-center flex-wrap">
        <a 
          href="#" 
          className="inline-flex items-center justify-center gap-2.5 px-7 py-[15px] rounded-[10px] bg-ink font-sans text-[15px] font-semibold transition-all duration-300 shadow-[0_4px_20px_rgba(15,14,13,.2)] hover:bg-gold hover:text-ink hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(201,147,58,.3)]"
        >
          <span className="text-cream inherited-hover-state">Start for Free</span>
          <svg className="text-cream" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
              <button className="flex items-center gap-2.5 px-6 py-[14px] rounded-[10px] bg-white text-ink font-sans text-[15px] font-medium cursor-pointer border-[1.5px] border-warm transition-all duration-250 no-underline shadow-[0_2px_12px_rgba(0,0,0,.06)] hover:border-mist hover:shadow-[0_4px_24px_rgba(0,0,0,.12)] hover:-translate-y-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
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
          <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-globe-icon lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></div>
          <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Online & Offline Access</h3>
          <p className="text-sm text-slate leading-[1.7]">Create and edit kinship charts anytime, anywhere. Your work remains accessible even without an internet connection.</p>
        </div>
      </div>

      {/* CARD 2: Export-Ready */}
      <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-file-down-icon lucide-file-down"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg></div>
          <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Export-Ready</h3>
          <p className="text-sm text-slate leading-[1.7]">Export your charts instantly for presentations, documentation, printing, or sharing with others.</p>
        </div>
      </div>

      {/* CARD 3: AI-Powered Chart Creation */}
      <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-cable-icon lucide-cable"><path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/><path d="M17 21v-2"/><path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/><path d="M21 21v-2"/><path d="M3 5V3"/><path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/><path d="M7 5V3"/></svg></div>
          <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">AI-Powered Chart Creation</h3>
          <p className="text-sm text-slate leading-[1.7]">Describe your family relationships in plain language, and the AI will automatically generate the kinship chart for you — no manual setup required.</p>
        </div>
      </div>

      {/* CARD 4: Cloud Sync with Google */}
      <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-cloud-icon lucide-cloud"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></div>
          <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Cloud Sync with Google</h3>
          <p className="text-sm text-slate leading-[1.7]">Sign in with Google to securely sync your charts across devices and continue your work anytime.</p>
        </div>
      </div>

      {/* CARD 5: Connected Family Accounts */}
      <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-heart-handshake-icon lucide-heart-handshake"><path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762"/></svg></div>
          <h3 className="font-sans text-[20px] font-bold mb-3 text-ink">Connected Family Accounts</h3>
          <p className="text-sm text-slate leading-[1.7]">Assign Google accounts to specific family members or units in the chart. Changes and shared diagrams can automatically appear in the connected relative’s account.</p>
        </div>
      </div>

      {/* CARD 6: Modern & Interactive Workspace */}
      <div className="bg-white border border-warm rounded-xl p-8 cursor-default relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,.08)] hover:border-gold/30 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center mb-5 text-[22px]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg></div>
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
            <button className="flex items-center gap-2.5 px-8 py-4 rounded-[10px] bg-cream text-ink font-sans text-[15px] font-semibold cursor-pointer border-none transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,.3)] hover:bg-gold hover:-translate-y-0.5">
              Start for Free →
            </button>
            <button className="flex items-center gap-2.5 px-7 py-[15px] rounded-[10px] bg-transparent text-cream font-sans text-[15px] font-medium cursor-pointer border-[1.5px] border-white/20 transition-all duration-300 hover:border-gold-light hover:text-gold-light">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
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
