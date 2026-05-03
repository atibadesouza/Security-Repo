// =============================================================================
// BROWSER SUPABASE CLIENT — anon key ONLY, never service_role
// =============================================================================
// Singleton client factory used by Server Components, Client Components, and
// Service-layer functions. All queries through this client run under RLS
// (auth.uid() resolved from the user's JWT cookie). Never call this from
// edge functions — they have their own client via `_shared/auth.ts`.
//
// Framework hint: this is the generic factory. For Next.js App Router, you
// usually want one variant for the browser (this file) and a separate one
// for server contexts that reads the cookie via `next/headers`. The Next.js
// equivalent is `@supabase/ssr` — install it and create both clients
// following https://supabase.com/docs/guides/auth/server-side/nextjs.
//
// ADAPT: rename the env-var prefix below for your framework
//   - Next.js:   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
//   - Vite:      VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//   - SvelteKit: PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY
// =============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ADAPT for your framework's public-env prefix
const SUPABASE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env.VITE_SUPABASE_URL) ||
  "";

const SUPABASE_ANON_KEY =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && process.env.VITE_SUPABASE_ANON_KEY) ||
  "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Throw at import time so the failure is visible during dev startup,
  // not later as a confusing "fetch failed" in the user's first action.
  throw new Error(
    "Missing public Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL " +
      "(or VITE_SUPABASE_URL) and the matching ANON_KEY in .env.local."
  );
}

let _client: SupabaseClient | null = null;

/**
 * Returns the singleton browser Supabase client.
 *
 * Rules:
 *  - This is the ONLY supabase-js import allowed in the Service layer
 *    (`src/lib/services/*`). Presentation code (`app/`, `components/`)
 *    must NOT import it directly — go through a service function.
 *  - The anon key is bundled into the client JS. It is public by design;
 *    RLS is what enforces access control, not the key itself.
 *  - Never construct a client with the service_role key on the browser.
 *    The service_role bypasses RLS and would catastrophically expose
 *    every user's data.
 */
export function supabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Persist session in browser localStorage; refresh tokens automatically.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}

/**
 * Convenience export: the singleton itself, eagerly created.
 * Most code should prefer `supabaseClient()` for laziness.
 */
export const supabase = supabaseClient();
