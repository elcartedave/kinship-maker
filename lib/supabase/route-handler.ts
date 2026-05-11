import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/config";

/**
 * Supabase client for App Router route handlers that must persist auth cookies
 * on the outgoing {@link NextResponse} (e.g. redirects after magic link).
 * The default {@link createClient} from `@/lib/supabase/server` uses
 * `next/headers` cookies and does not always attach Set-Cookie to a redirect
 * returned from a route handler.
 */
export function createRouteHandlerClient(
  request: NextRequest,
  response: NextResponse,
) {
  if (!isSupabaseConfigured) {
    return null;
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
