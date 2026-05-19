"use server";

import { redirect } from "next/navigation";
import * as z from "zod";

import { getUserDisplayName, getUserImageUrl } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = {
  errors?: {
    firstName?: string[];
    middleName?: string[];
    lastName?: string[];
    nickname?: string[];
    age?: string[];
    sexAssignedAtBirth?: string[];
    form?: string[];
  };
  values?: {
    firstName: string;
    middleName: string;
    lastName: string;
    nickname: string;
    age: string;
    sexAssignedAtBirth: string;
  };
};

const ProfileFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  middleName: z.string().trim(),
  lastName: z.string().trim().min(1, "Last name is required."),
  nickname: z.string().trim().min(1, "Nickname is required."),
  age: z.coerce
    .number("Age is required.")
    .int("Age must be a whole number.")
    .min(1, "Age must be at least 1.")
    .max(130, "Age must be 130 or below."),
  sexAssignedAtBirth: z.enum(["male", "female"], {
    error: "Sex assigned at birth is required.",
  }),
  nextPath: z.string().optional(),
});

function stickyValues(values: {
  firstName: string;
  middleName: string;
  lastName: string;
  nickname: string;
  age: string;
  sexAssignedAtBirth: string;
}) {
  return {
    firstName: values.firstName,
    middleName: values.middleName,
    lastName: values.lastName,
    nickname: values.nickname,
    age: values.age,
    sexAssignedAtBirth: values.sexAssignedAtBirth,
  };
}

function safeNextPath(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}

export async function saveProfile(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const values = {
    firstName: String(formData.get("firstName") ?? ""),
    middleName: String(formData.get("middleName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
    age: String(formData.get("age") ?? ""),
    sexAssignedAtBirth: String(formData.get("sexAssignedAtBirth") ?? ""),
    nextPath: safeNextPath(formData.get("next")),
  };

  const parsed = ProfileFormSchema.safeParse(values);

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      values: stickyValues(values),
    };
  }

  const supabase = await createClient();

  if (!supabase) {
    return {
      errors: {
        form: ["Supabase is not configured yet."],
      },
      values: stickyValues(values),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      errors: {
        form: ["Please sign in before completing your profile."],
      },
      values: stickyValues(values),
    };
  }

  const displayName = getUserDisplayName(user);
  const imageUrl = getUserImageUrl(user);

  const { error } = await supabase.from("users").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      name: displayName,
      image_url: imageUrl,
      first_name: parsed.data.firstName,
      middle_name: parsed.data.middleName || null,
      last_name: parsed.data.lastName,
      nickname: parsed.data.nickname,
      age: parsed.data.age,
      sex_assigned_at_birth: parsed.data.sexAssignedAtBirth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return {
      errors: {
        form: [error.message],
      },
      values: stickyValues(values),
    };
  }

  redirect(parsed.data.nextPath ?? "/");
}
