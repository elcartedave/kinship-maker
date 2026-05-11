import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function ChartsLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isSupabaseConfigured) {
    return children;
  }

  const supabase = await createClient();
  if (!supabase) {
    return children;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return children;
}
