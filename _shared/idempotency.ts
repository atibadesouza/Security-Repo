// =============================================================================
// IDEMPOTENCY — dedupe retried mutating edge-function calls
// =============================================================================
// Networks retry. Users double-click. Webhooks redeliver. Without idempotency, a
// "create order" or "charge card" can run twice. This helper records the result
// of a mutating request keyed by a client-supplied `Idempotency-Key` header, so
// a replay returns the FIRST result instead of doing the work again.
//
// Requires a table (add to your seed/migration with the project's [slug]_ prefix):
//
//   create table if not exists public.[slug]_idempotency_keys (
//     id          uuid primary key default gen_random_uuid(),
//     user_id     uuid not null references auth.users(id) on delete cascade,
//     key         text not null,
//     status      text not null default 'in_progress'
//                   check (status in ('in_progress','completed')),
//     response    jsonb,
//     created_at  timestamptz not null default now(),
//     unique (user_id, key)
//   );
//   alter table public.[slug]_idempotency_keys enable row level security;
//   create policy "[slug]_idem_own" on public.[slug]_idempotency_keys
//     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
//
// Pass a SERVICE-ROLE client (writes happen regardless of the caller's RLS path,
// scoped explicitly by user_id). Set IDEMPOTENCY_TABLE in your env.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = Deno.env.get("IDEMPOTENCY_TABLE") ?? "idempotency_keys";

export interface IdempotencyHit<T> {
  /** true if this key was already completed — `response` is the original result */
  replay: boolean;
  response: T | null;
}

/**
 * Check whether `key` for `userId` already ran. If it completed, returns the
 * stored response (replay=true). If new, reserves the key (status in_progress)
 * and returns replay=false so the caller proceeds. Fails OPEN on storage errors
 * (better to risk a rare double-run than to hard-block all writes).
 */
export async function beginIdempotent<T>(
  admin: SupabaseClient,
  userId: string,
  key: string | null
): Promise<IdempotencyHit<T>> {
  if (!key) return { replay: false, response: null };
  try {
    const { data: existing } = await admin
      .from(TABLE)
      .select("status, response")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();

    if (existing?.status === "completed") {
      return { replay: true, response: (existing.response as T) ?? null };
    }
    if (!existing) {
      await admin.from(TABLE).insert({ user_id: userId, key, status: "in_progress" });
    }
    return { replay: false, response: null };
  } catch (err) {
    console.warn("[idempotency] begin failed (fail-open)", err);
    return { replay: false, response: null };
  }
}

/** Store the final result so a future replay of `key` returns it. */
export async function completeIdempotent(
  admin: SupabaseClient,
  userId: string,
  key: string | null,
  response: unknown
): Promise<void> {
  if (!key) return;
  try {
    await admin
      .from(TABLE)
      .update({ status: "completed", response })
      .eq("user_id", userId)
      .eq("key", key);
  } catch (err) {
    console.warn("[idempotency] complete failed", err);
  }
}
