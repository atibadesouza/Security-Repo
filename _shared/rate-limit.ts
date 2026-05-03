// =============================================================================
// RATE LIMITING MIDDLEWARE
// =============================================================================
// Protects edge functions from abuse (brute force, DoS, runaway loops).
// Reads/writes a project-prefixed `<slug>_rate_limits` table created by the
// Seed SQL generator. Service-role client is used INSIDE the function only —
// never returned to the client, never exposed.
//
// Tiers (calls per window per user):
//   auth        — 5  / minute     (login, signup, password reset)
//   read        — 60 / minute     (list, get)
//   write       — 30 / minute     (create, update, delete)
//   expensive   — 5  / hour       (LLM calls, file processing, sends)
//
// Fail-open semantics: if the rate_limits table errors (e.g., schema not
// applied yet, transient DB issue), the function ALLOWS the request rather
// than 500'ing every call. The error is logged server-side. Tighten this
// only if your project has a stronger availability-vs-abuse tradeoff.
//
// ADAPT the `RATE_LIMITS_TABLE` constant to match your project's slug.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resolved at runtime from the RATE_LIMITS_TABLE env var so this file is
// PROJECT-AGNOSTIC. The Seed generator creates `<slug>_rate_limits` and
// claude.md Setup Sequence exports `RATE_LIMITS_TABLE=<slug>_rate_limits`
// alongside the standard Supabase secrets. Fallback `"rate_limits"` is the
// pre-prefix legacy name — only used if the env var was forgotten, and
// every call will fail-open with a console.warn pointing here.
const RATE_LIMITS_TABLE =
  Deno.env.get("RATE_LIMITS_TABLE") ?? "rate_limits";

export type RateLimitTier = "auth" | "read" | "write" | "expensive";

interface TierConfig {
  /** maximum number of calls allowed in `windowSeconds` */
  max: number;
  /** rolling window size in seconds */
  windowSeconds: number;
}

const TIERS: Record<RateLimitTier, TierConfig> = {
  auth: { max: 5, windowSeconds: 60 },
  read: { max: 60, windowSeconds: 60 },
  write: { max: 30, windowSeconds: 60 },
  expensive: { max: 5, windowSeconds: 60 * 60 },
};

export interface RateLimitResult {
  allowed: boolean;
  /** seconds the client should wait before retrying (only set when !allowed) */
  retryAfter?: number;
  /** number of calls remaining in the current window (for headers) */
  remaining?: number;
}

/**
 * Checks whether `userId` may make another `fnName` call under the given
 * `tier`. If allowed, records the call. If denied, returns retryAfter in
 * seconds. Use this AFTER requireAuth, BEFORE validateBody.
 *
 * Usage:
 *   const limit = await rateLimit(user.id, "create_item", "write");
 *   if (!limit.allowed) {
 *     return new Response(
 *       JSON.stringify({ error: "Too many requests" }),
 *       {
 *         status: 429,
 *         headers: {
 *           ...corsHeaders(req),
 *           "Content-Type": "application/json",
 *           "Retry-After": String(limit.retryAfter),
 *         },
 *       }
 *     );
 *   }
 */
export async function rateLimit(
  userId: string,
  fnName: string,
  tier: RateLimitTier
): Promise<RateLimitResult> {
  const config = TIERS[tier];
  const now = Date.now();
  const windowStart = new Date(now - config.windowSeconds * 1000).toISOString();
  const key = `${userId}:${fnName}`;

  // Service-role client — used ONLY inside this function for the rate-limit
  // table read/write. Never returned to the caller.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // Count calls in the current window
    const { count, error: countError } = await admin
      .from(RATE_LIMITS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("key", key)
      .gte("created_at", windowStart);

    if (countError) {
      // Fail open — log and allow. Avoids cascading 500s if the schema
      // isn't applied yet or the table has a transient issue.
      console.warn("[rate-limit] count failed (fail-open)", countError);
      return { allowed: true };
    }

    const used = count ?? 0;
    if (used >= config.max) {
      return {
        allowed: false,
        retryAfter: config.windowSeconds,
        remaining: 0,
      };
    }

    // Record this call. We don't await heavily — best-effort insert.
    const { error: insertError } = await admin
      .from(RATE_LIMITS_TABLE)
      .insert({ key, user_id: userId });

    if (insertError) {
      console.warn("[rate-limit] insert failed (fail-open)", insertError);
    }

    return {
      allowed: true,
      remaining: config.max - used - 1,
    };
  } catch (err) {
    console.warn("[rate-limit] unexpected error (fail-open)", err);
    return { allowed: true };
  }
}
