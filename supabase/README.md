# Supabase setup for Kinship Maker

## Database

1. Open the Supabase project **SQL Editor**.
2. Run the statements in [`users.sql`](./users.sql). This updates the existing `users` table with the required profile columns (`first_name`, optional `middle_name`, `last_name`, `nickname`, and `age`) and row-level security so each user only reads and writes their own profile.
3. Run the statements in [`charts.sql`](./charts.sql). This creates the `charts` table and row-level security so each user only reads and writes their own rows.
4. Run the statements in [`collaboration.sql`](./collaboration.sql). This adds chart memberships, node-to-user links, and pending approval invitations.

The app treats **Supabase as the source of truth** for chart rows when auth is enabled. IndexedDB on the client is only a cache for faster editing and offline use while signed in.

## Auth (Google OAuth)

The app uses **Google Sign-In via Supabase** (PKCE code flow) — no email/password and no magic links are required.

### Google Cloud Console

1. Create an **OAuth 2.0 Client ID** of type **Web application**.
2. Add **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - your production origin
3. Add **Authorized redirect URIs**:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret**.

### Supabase dashboard

1. Go to **Authentication → Providers → Google**, enable it, and paste the client ID and secret. Save.
2. In **Authentication → URL configuration**, set:
   - **Site URL**: e.g. `http://localhost:3000` for dev (or your production URL).
   - **Redirect URLs**: include `http://localhost:3000` and `http://localhost:3000/auth/confirm` (and the equivalents for production).

### How the redirect works

Clicking *Continue with Google* calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: ".../auth/confirm?next=/" } })`. After Google authenticates the user, Supabase redirects to `/auth/confirm?code=…`, which exchanges the code for a session via [`app/auth/confirm/route.ts`](../app/auth/confirm/route.ts) and redirects to the `next` path.

The legacy `token_hash` branch in that route is kept as a no-op fallback for any existing email-OTP links — it does not affect the Google flow.

## Next.js env

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` plus either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The app refreshes the session on each navigation via the root [`proxy.ts`](../proxy.ts) helper [`lib/supabase/proxy.ts`](../lib/supabase/proxy.ts).
