import { useEffect, useState } from "react";

/**
 * Tracks `navigator.onLine` reactively so components can show
 * online/offline status without re-implementing the same listeners.
 *
 * Defaults to `true` during SSR (no `navigator`) — components should
 * treat it as a hint rather than a guarantee.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
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

  return online;
}
