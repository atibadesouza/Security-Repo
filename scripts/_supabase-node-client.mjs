// =============================================================================
// NODE.JS SUPABASE CLIENT FACTORY — for scripts (test bootstrap, seeders)
// =============================================================================
// Use from Node.js scripts only — `scripts/create-test-users.mjs`,
// `scripts/seed-data.mjs`, admin maintenance, etc. Never from app code.
//
// Pre-configures the `ws` WebSocket transport because Supabase Realtime
// requires a WS implementation that Node doesn't ship. If your project
// doesn't use Realtime from scripts, the `ws` import is loaded lazily and
// failure to install it is silently tolerated (the client just works
// without realtime support).
//
// Install in the consuming project:
//   npm i -D @supabase/supabase-js ws
//
// Import:
//   import { createNodeAdminClient } from "./scripts/_supabase-node-client.mjs";
//
// Env vars required (loaded from .env.local by the calling script):
//   - SUPABASE_URL                   (or NEXT_PUBLIC_SUPABASE_URL)
//   - SUPABASE_SERVICE_ROLE_KEY      (service-role bypasses RLS — server-only)
// =============================================================================

import { createClient } from "@supabase/supabase-js";

/**
 * Returns a service-role Supabase client suitable for Node.js scripts.
 * Sessions and refresh tokens are disabled (the service role doesn't need
 * them). RLS is bypassed — never expose this client to a browser.
 *
 * @param {object} [opts]
 * @param {string} [opts.url] - Override SUPABASE_URL.
 * @param {string} [opts.serviceRoleKey] - Override SUPABASE_SERVICE_ROLE_KEY.
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient>}
 */
export async function createNodeAdminClient(opts = {}) {
  const url =
    opts.url ??
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = opts.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "createNodeAdminClient requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) " +
        "and SUPABASE_SERVICE_ROLE_KEY in .env.local. Service-role key bypasses " +
        "RLS — never commit it or expose it to the browser."
    );
  }

  // ws is loaded lazily so the helper still works in environments that
  // don't need realtime (the import would otherwise fail at module load).
  const wsModule = await import("ws").catch(() => null);

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: wsModule
      ? { params: {}, transport: wsModule.default }
      : undefined,
  });
}
