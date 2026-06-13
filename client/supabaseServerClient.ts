// =============================================================================
// SERVER SUPABASE CLIENT — Next.js App Router (@supabase/ssr), anon key ONLY
// =============================================================================
// The cookie-based server counterpart to `supabaseClient.ts`. Use this in
// Server Components, Route Handlers, and Server Actions so RLS sees the user's
// session (read from the request cookies), and so refreshed tokens are written
// back to the response. Never use the service_role key here — RLS is the access
// control, and service_role would bypass it.
//
// Requires: npm i @supabase/ssr @supabase/supabase-js
// Copy target (per claude.md): src/lib/supabase/server.ts
//
// Pairs with `middleware.ts` (which refreshes the session on every request) and
// the browser client `supabaseClient.ts` (copied to src/lib/supabase/client.ts).
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client bound to the incoming request's cookies.
 *
 * Next.js 15: `cookies()` is async — this factory is async too. Await it:
 *
 *   const supabase = await supabaseServerClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *
 * In a Server Component the cookie store is read-only; the try/catch around
 * `set`/`remove` swallows the expected write error there. Session refresh
 * writes happen in `middleware.ts`, which CAN set cookies.
 */
export async function supabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (read-only cookies). Safe to ignore —
          // middleware.ts performs the actual session-refresh cookie writes.
        }
      },
    },
  });
}
