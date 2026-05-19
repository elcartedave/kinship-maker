"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallButtonBig({ className = "" }: { className?: string }) {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIos] = useState(() =>
    typeof window === "undefined"
      ? false
      : /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
        !(window as Window & { MSStream?: unknown }).MSStream,
  );
  const [isStandalone] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  if (isStandalone) {
    return null;
  }

  // STANDARD INSTALLATION MODE
  if (installEvent) {
    return (
      <button
        type="button"
        onClick={async () => {
          await installEvent.prompt();
          await installEvent.userChoice;
          setInstallEvent(null);
        }}
        className={className}
      >
        {/* Icon Container (Matches exactly 14x14 grid bounding box) */}
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
            <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* Text block matching the identical alignment properties */}
        <span className="text-[22px] font-bold tracking-tight text-center px-2 h-[32px] flex items-center justify-center">
          Install App
        </span>
      </button>
    );
  }

  // IOS FALLBACK INSTALLED SCREEN WRAPPED TO LOOK LIKE THE CHIPS
  if (isIos) {
    return (
      <div className={`${className} px-4 !justify-start pt-6 select-none`}>
        {/* Sub-label info node header */}
        <span className="text-[10px] font-bold uppercase tracking-wider text-gold mb-1">
          iOS Installation
        </span>
        <p className="text-[13px] font-medium leading-snug text-ink/70 text-center">
          Tap the <span className="font-bold text-ink">Share</span> menu button, then select <span className="font-bold text-ink">Add to Home Screen</span>.
        </p>
      </div>
    );
  }

  return null;
}