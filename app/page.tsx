import { redirect } from "next/navigation";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import {
  getCurrentUserAndProfile,
  isUserProfileComplete,
} from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function Page() {
  if (isSupabaseConfigured) {
    const { user, profile } = await getCurrentUserAndProfile();

    if (user && !isUserProfileComplete(profile)) {
      redirect("/profile/setup?next=/");
    }
  }

  return <DashboardPage />;
}
