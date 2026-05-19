import { redirect } from "next/navigation";

import { ProfileForm } from "@/app/profile/setup/profile-form";
import {
  getCurrentUserAndProfile,
  isUserProfileComplete,
  profileInitialValues,
} from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function safeNextPath(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  if (value.startsWith("/profile/setup")) {
    return "/";
  }

  return value;
}

export default async function ProfileSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  if (!isSupabaseConfigured) {
    redirect("/");
  }

  const { next } = await searchParams;
  const nextPath = safeNextPath(next);
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/");
  }

  if (isUserProfileComplete(profile)) {
    redirect(nextPath);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-8 sm:px-8">
      <section className="paper-panel w-full rounded-[2rem] p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent-strong">
          Profile setup
        </p>
        <h1 className="font-display mt-3 text-4xl leading-tight text-ink sm:text-5xl">
          Tell us who is making the charts.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-soft sm:text-base">
          Complete these details once before using your account. Middle name is
          optional.
        </p>
        <ProfileForm
          initialValues={profileInitialValues(user, profile)}
          nextPath={nextPath}
        />
      </section>
    </main>
  );
}
