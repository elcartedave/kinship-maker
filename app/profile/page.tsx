import { redirect } from "next/navigation";

import { ProfileForm } from "@/app/profile/setup/profile-form";
import { ToastBridge } from "@/components/ui/toast-bridge";
import { getCurrentUserAndProfile, profileInitialValues } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function getToastMessage(value: string | string[] | undefined) {
  const toast = Array.isArray(value) ? value[0] : value;

  if (toast === "profile-saved") {
    return "Profile saved successfully.";
  }

  return null;
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string | string[] }>;
}) {
  if (!isSupabaseConfigured) {
    redirect("/");
  }

  const { toast } = await searchParams;
  const { user, profile } = await getCurrentUserAndProfile();
  const toastMessage = getToastMessage(toast);

  if (!user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-8 sm:px-8">
      <ToastBridge message={toastMessage} clearSearchParam="toast" />
      <section className="paper-panel w-full rounded-[2rem] p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent-strong">
            Profile
          </p>
          <a
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-strong transition hover:text-accent"
          >
            Back to dashboard
          </a>
        </div>
        <h1 className="font-display mt-3 text-4xl leading-tight text-ink sm:text-5xl">
          Update your details
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-soft sm:text-base">
          Keep your profile up to date so ego symbols reflect your account.
        </p>
        <ProfileForm
          initialValues={profileInitialValues(user, profile)}
          nextPath="/profile"
          submitLabel="Save profile"
          email={user.email ?? undefined}
        />
      </section>
    </main>
  );
}
