export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Supports new publishable keys (`sb_publishable_…`) or classic anon JWT. */
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabasePublishableKey.length > 0;
