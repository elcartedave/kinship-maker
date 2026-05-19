import { redirect } from "next/navigation";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { getCurrentUserAndProfile, isUserProfileComplete } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function getToastMessage(value: string | string[] | undefined) {
  const toast = Array.isArray(value) ? value[0] : value;

  if (toast === "profile-saved") {
    return "Profile saved successfully.";
  }

  return null;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string | string[] }>;
}) {
  const { toast } = await searchParams;
  const toastMessage = getToastMessage(toast);
  let welcomeName = "User";

  if (isSupabaseConfigured) {
    const { user, profile } = await getCurrentUserAndProfile();

    if (user && !isUserProfileComplete(profile)) {
      redirect("/profile/setup?next=/");
    }

    welcomeName = profile?.nickname?.trim() || "User";
  }

  return (
    <DashboardPage welcomeName={welcomeName} toastMessage={toastMessage} />
  );
}
