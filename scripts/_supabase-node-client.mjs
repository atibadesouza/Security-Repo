// =============================================================================
// _supabase-node-client.mjs — shared Supabase clients for local scripts ONLY
// =============================================================================
// Local admin/test scripts (create-test-users, seed bootstrap, verify-*) need a
// service-role client. That key bypasses RLS, so it lives ONLY here and is used
// ONLY by files under scripts/ — never imported by app code (the pre-commit hook
// and verify-layer-boundaries.mjs enforce that). Reads from .env.local /.env.test.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

/** Minimal .env loader (no dotenv dep). Later files override earlier. */
export function loadEnv(files = [".env.local", ".env.test"]) {
  const env = { ...process.env };
  for (const f of files) {
    try {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      /* file optional */
    }
  }
  return env;
}

const env = loadEnv();
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Service-role client — bypasses RLS. scripts/ ONLY. Never ship to the client. */
export function adminClient() {
  if (!URL || !SERVICE_ROLE) throw new Error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local");
  return createClient(URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anon client — runs under RLS, used to verify a real user's-eye view. */
export function anonClient() {
  if (!URL || !ANON) throw new Error("Need SUPABASE_URL + SUPABASE_ANON_KEY");
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

export { URL as SUPABASE_URL, env as ENV };
