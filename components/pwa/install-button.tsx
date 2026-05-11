"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallButton({ className = "" }: { className?: string }) {
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
        Install app
      </button>
    );
  }

  if (isIos) {
    return (
      <p className={className}>
        Install on iPhone or iPad from the Share menu, then choose Add to Home
        Screen.
      </p>
    );
  }

  return null;
}
