import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

function buildErrorRedirect(request: NextRequest, message: string) {
  const errorUrl = new URL("/auth/error", request.url);
  errorUrl.searchParams.set("message", message);
  return NextResponse.redirect(errorUrl);
}

/**
 * Tiny HTML response served when the magic link lands on /auth/confirm with no
 * query string. Some Supabase email templates use the implicit flow and put
 * the session in a URL hash fragment (#access_token=…), which the server
 * cannot read. The Supabase browser client running inside <AppShellProvider>
 * has `detectSessionInUrl: true`, so we just need the user to load any
 * client-rendered page; this page redirects to the dashboard once that has
 * happened.
 */
function hashFallbackHtml(nextPath: string): string {
  const safeNext = nextPath.replace(/[^A-Za-z0-9/_\-]/g, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Signing in…</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 2rem; color: #1f1b16; background: #fbf6ec; }
    </style>
  </head>
  <body>
    <p>Signing you in…</p>
    <script>
      (function () {
        var hash = window.location.hash || "";
        var target = ${JSON.stringify(safeNext || "/")};
        if (hash && hash.length > 1) {
          // Forward hash to the destination so the Supabase browser client
          // running there can pick up the session before we land on the page.
          window.location.replace(target + hash);
        } else {
          window.location.replace(target);
        }
      })();
    </script>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const supabaseError = url.searchParams.get("error");
  const supabaseErrorDescription = url.searchParams.get("error_description");

  if (supabaseError) {
    const detail = supabaseErrorDescription
      ? decodeURIComponent(supabaseErrorDescription).replace(/\+/g, " ")
      : supabaseError;
    console.warn("[auth/confirm] Supabase returned error:", supabaseError, supabaseErrorDescription);
    return buildErrorRedirect(
      request,
      `Supabase rejected the sign-in link: ${detail}. Request a fresh magic link.`,
    );
  }

  const successUrl = request.nextUrl.clone();
  successUrl.pathname = nextPath;
  successUrl.searchParams.delete("token_hash");
  successUrl.searchParams.delete("type");
  successUrl.searchParams.delete("code");
  successUrl.searchParams.delete("next");
  successUrl.searchParams.delete("error");
  successUrl.searchParams.delete("error_description");

  if (!code && !(tokenHash && type)) {
    return new NextResponse(hashFallbackHtml(nextPath), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const response = NextResponse.redirect(successUrl);
  const supabase = createRouteHandlerClient(request, response);

  if (!supabase) {
    return buildErrorRedirect(request, "Cloud authentication is not configured.");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
    console.warn("[auth/confirm] exchangeCodeForSession failed:", error.message);
    return buildErrorRedirect(
      request,
      `Could not exchange sign-in code: ${error.message}. The link may have already been used or expired — request a new one.`,
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return response;
    }
    console.warn("[auth/confirm] verifyOtp failed:", error.message);
    return buildErrorRedirect(
      request,
      `Could not verify sign-in token: ${error.message}. Request a fresh magic link.`,
    );
  }

  return buildErrorRedirect(
    request,
    "We could not verify that sign-in link. Request a fresh magic link and try again.",
  );
}
