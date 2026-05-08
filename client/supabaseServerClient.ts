// =============================================================================
// SERVER SUPABASE CLIENT — cookie-based session via @supabase/ssr
// =============================================================================
// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. Reads session from request cookies via Next.js `cookies()`
// API — same cookies the browser client and middleware read/write, so the
// three layers stay in sync.
//
// MUST NOT be imported from Client Components — depends on `next/headers`
// which is server-only.
//
// Required deps:
//   npm i @supabase/ssr @supabase/supabase-js
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing public Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL " +
      "and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
  );
}

/**
 * Returns a server-side Supabase client wired to the request's cookies.
 * Use from Server Components, Route Handlers, and Server Actions.
 *
 * Usage:
 *   import { createServerSupabaseClient } from "@/lib/supabase/server";
 *   const supabase = await createServerSupabaseClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component context — setAll noop. Middleware refreshes
          // the session cookie on the response, so this branch is benign.
        }
      },
    },
  });
}
