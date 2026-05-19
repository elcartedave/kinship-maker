import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  image_url: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  nickname: string | null;
  age: number | null;
  sex_assigned_at_birth: "male" | "female" | null;
  updated_at: string | null;
};

export type ProfileSetupInitialValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  nickname: string;
  age: string;
  sexAssignedAtBirth: string;
};

export function isUserProfileComplete(
  profile: Pick<
    UserProfile,
    "first_name" | "last_name" | "nickname" | "age" | "sex_assigned_at_birth"
  > | null,
) {
  return Boolean(
    profile?.first_name?.trim() &&
    profile.last_name?.trim() &&
    profile.nickname?.trim() &&
    profile.age != null &&
    Number.isInteger(profile.age) &&
    profile.age > 0 &&
    (profile.sex_assigned_at_birth === "male" ||
      profile.sex_assigned_at_birth === "female"),
  );
}

export function getUserDisplayName(user: User) {
  const metadata = user.user_metadata as {
    name?: unknown;
    full_name?: unknown;
  };

  const name = metadata.name ?? metadata.full_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function getUserImageUrl(user: User) {
  const metadata = user.user_metadata as {
    avatar_url?: unknown;
    picture?: unknown;
  };

  const imageUrl = metadata.avatar_url ?? metadata.picture;
  return typeof imageUrl === "string" && imageUrl.trim()
    ? imageUrl.trim()
    : null;
}

export function profileInitialValues(
  user: User,
  profile: Partial<UserProfile> | null,
): ProfileSetupInitialValues {
  const displayName = getUserDisplayName(user);
  const nameParts = displayName?.split(/\s+/).filter(Boolean) ?? [];

  return {
    firstName: profile?.first_name ?? nameParts[0] ?? "",
    middleName: profile?.middle_name ?? "",
    lastName:
      profile?.last_name ??
      (nameParts.length > 1 ? nameParts[nameParts.length - 1] : ""),
    nickname: profile?.nickname ?? (nameParts.length > 0 ? nameParts[0] : ""),
    age: profile?.age == null ? "" : String(profile.age),
    sexAssignedAtBirth: profile?.sex_assigned_at_birth ?? "",
  };
}

export async function getCurrentUserAndProfile() {
  const supabase = await createClient();

  if (!supabase) {
    return { user: null, profile: null, error: null };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, profile: null, error: userError };
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select(
      "id, email, name, image_url, first_name, middle_name, last_name, nickname, age, sex_assigned_at_birth, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle<UserProfile>();

  return { user, profile: profile ?? null, error };
}
