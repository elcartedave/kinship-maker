"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type ToastBridgeProps = {
  message: string | null | undefined;
  tone?: "success" | "error";
  clearSearchParam?: string;
};

export function ToastBridge({ message, clearSearchParam }: ToastBridgeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastToastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message) {
      return;
    }

    if (lastToastMessageRef.current === message) {
      return;
    }

    lastToastMessageRef.current = message;

    toast(message);

    if (!clearSearchParam) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete(clearSearchParam);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [clearSearchParam, message, pathname, router, searchParams]);

  return null;
}
