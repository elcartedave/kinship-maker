import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import {
  getCurrentUserAndProfile,
  isUserProfileComplete,
} from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function ChartsLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isSupabaseConfigured) {
    return children;
  }

  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/");
  }

  if (!isUserProfileComplete(profile)) {
    redirect("/profile/setup?next=/");
  }

  return children;
}
