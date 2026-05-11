"use client";

import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  PencilLine,
} from "lucide-react";

/**
 * Discriminated state describing what to show in the title-panel save
 * pill. Computed in the editor (see `chart-editor-page.tsx`) and rendered
 * here. The Canva/Docs feel comes from showing a quick "Saving…" tick
 * during the cloud roundtrip, then settling on "Saved" with a timestamp.
 */
export type SaveStatusState =
  | { kind: "loading" }
  | { kind: "edited" }
  | { kind: "saving-local" }
  | { kind: "saved-local"; savedAt: string }
  | { kind: "saving-cloud" }
  | { kind: "saved-cloud"; savedAt: string }
  | { kind: "offline-pending"; savedAt: string }
  | { kind: "offline-idle" }
  | { kind: "error"; message: string };

type SaveStatusIndicatorProps = {
  state: SaveStatusState;
  /** Optional manual retry trigger (only used by the `error` state). */
  onRetry?: () => void;
};

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function SaveStatusIndicator({ state, onRetry }: SaveStatusIndicatorProps) {
  const { icon, label, tone, title } = describeState(state);

  const className =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors sm:text-[11px] " +
    tone;

  if (state.kind === "error" && onRetry) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={`${className} cursor-pointer hover:brightness-95`}
        title={title}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <span className={className} title={title}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function describeState(state: SaveStatusState): {
  icon: React.ReactNode;
  label: string;
  title: string;
  tone: string;
} {
  const SPIN = "animate-spin";
  switch (state.kind) {
    case "loading":
      return {
        icon: <Loader2 className={`size-3 ${SPIN}`} />,
        label: "Loading…",
        title: "Loading chart from device cache",
        tone: "bg-white/70 text-ink-soft",
      };
    case "edited":
      return {
        icon: <PencilLine className="size-3" />,
        label: "Editing…",
        title: "Pending changes will save shortly",
        tone: "bg-white/70 text-ink-soft",
      };
    case "saving-local":
      return {
        icon: <Loader2 className={`size-3 ${SPIN}`} />,
        label: "Saving…",
        title: "Saving to this device",
        tone: "bg-white/70 text-ink-soft",
      };
    case "saved-local":
      return {
        icon: <Check className="size-3" />,
        label: `Saved · ${formatTime(state.savedAt)}`,
        title: "Saved to this device",
        tone: "bg-white/70 text-ink-soft",
      };
    case "saving-cloud":
      return {
        icon: <Loader2 className={`size-3 ${SPIN}`} />,
        label: "Saving to cloud…",
        title: "Pushing the latest changes to your account",
        tone: "bg-accent/10 text-accent-strong",
      };
    case "saved-cloud":
      return {
        icon: <Cloud className="size-3" />,
        label: `Saved to cloud · ${formatTime(state.savedAt)}`,
        title: "All changes are synced to your account",
        tone: "bg-accent/10 text-accent-strong",
      };
    case "offline-pending":
      return {
        icon: <CloudOff className="size-3" />,
        label: `Saved offline · ${formatTime(state.savedAt)}`,
        title:
          "You're offline. Changes are saved on this device and will sync when you reconnect.",
        tone: "bg-amber-100 text-amber-900",
      };
    case "offline-idle":
      return {
        icon: <CloudOff className="size-3" />,
        label: "Offline",
        title: "You're offline. Recent changes (if any) will sync when you reconnect.",
        tone: "bg-amber-100 text-amber-900",
      };
    case "error":
      return {
        icon: <AlertTriangle className="size-3" />,
        label: "Sync failed — retry",
        title: state.message,
        tone: "bg-rose-100 text-rose-900",
      };
  }
}
