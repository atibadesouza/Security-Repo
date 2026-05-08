// =============================================================================
// BROWSER SUPABASE CLIENT — cookie-based session via @supabase/ssr
// =============================================================================
// Cookie-based session that stays in sync with Next.js middleware. NEVER use
// `createClient` from `@supabase/supabase-js` in browser code — that uses
// localStorage for the session, which middleware (server) cannot see, so
// signout "succeeds" client-side but the user appears authenticated on the
// next server request.
//
// This template assumes Next.js App Router. For other frameworks, swap the
// env-var prefix and use the framework's native cookie store. The
// @supabase/ssr package supports SvelteKit and Astro analogues.
//
// Required deps:
//   npm i @supabase/ssr @supabase/supabase-js
// =============================================================================

import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Throw at import time so the failure is visible during dev startup,
  // not later as a confusing "fetch failed" in the user's first action.
  throw new Error(
    "Missing public Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL " +
      "and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
  );
}

/**
 * Returns a browser Supabase client. Sessions are stored in cookies that
 * Next.js middleware can read and refresh. Use this from Client Components,
 * hooks, and the Service layer (`src/lib/services/*`).
 *
 * Server Components, Route Handlers, and Server Actions must use
 * `createServerSupabaseClient()` from `./supabaseServerClient.ts` instead —
 * that one reads cookies via `next/headers` rather than the browser store.
 *
 * Rules:
 *  - The anon key is bundled into the client JS. It is public by design;
 *    RLS is what enforces access control, not the key itself.
 *  - Never construct a client with the service_role key on the browser.
 *    The service_role bypasses RLS and would catastrophically expose
 *    every user's data.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
}
