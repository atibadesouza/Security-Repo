// =============================================================================
// IDEMPOTENCY — check-before-create wrapper for edge functions
// =============================================================================
// Every edge function that creates or updates a long-running record (audio
// transcription, image generation, async LLM call, anything that writes a
// record the user might double-submit) MUST call `checkIdempotency` before
// kicking off the work.
//
// Pattern:
//   1. Check if the operation has already completed for this resource.
//   2. If yes — return the actual stored result (NOT a placeholder string).
//   3. If in progress — return 409 Conflict with retry guidance.
//   4. If not started — proceed with the operation, set status to one of
//      `inProgressStates` first, then complete with one of `completedStates`.
//
// Anti-pattern to avoid: returning a literal placeholder like
// "Already transcribed" or "Already submitted". Callers will treat that
// string as the actual result and store it / display it as transcript text.
// =============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface IdempotentCheckArgs<T> {
  /** Supabase client scoped appropriately (user RLS or service-role). */
  client: SupabaseClient;
  /** Table to check, including any project prefix (e.g. "abc_transcripts"). */
  table: string;
  /** Primary key value of the record to inspect. */
  recordId: string;
  /** Column whose stored value is returned when status is completed. */
  resultColumn: keyof T & string;
  /** Status values that mean "work has started but not finished". */
  inProgressStates: string[];
  /** Status values that mean "work finished successfully". */
  completedStates: string[];
  /** Status column name (defaults to "status"). */
  statusColumn?: keyof T & string;
}

export type IdempotentCheckResult<T, K extends keyof T & string> =
  | { kind: "completed"; result: T[K] }
  | { kind: "in_progress" }
  | { kind: "not_started" };

/**
 * Inspects the record's current status. Returns:
 *   - `{ kind: "completed", result }` — caller should return the stored result.
 *   - `{ kind: "in_progress" }` — caller should return 409 with retry guidance.
 *   - `{ kind: "not_started" }` — caller proceeds, transitions status to
 *     in-progress before kicking off the work.
 *
 * If the record is missing or unreadable, treat as `not_started` so a fresh
 * record can be created. RLS misses (record exists but the caller can't see
 * it) collapse into the same branch — that's intentional, since the caller
 * cannot operate on a record they cannot read.
 *
 * Usage:
 *
 *   const idem = await checkIdempotency<TranscriptRow>({
 *     client: supabase,
 *     table: "abc_transcripts",
 *     recordId: body.record_id,
 *     resultColumn: "transcript_text",
 *     inProgressStates: ["processing"],
 *     completedStates: ["complete", "ready"],
 *   });
 *
 *   if (idem.kind === "completed") {
 *     return new Response(
 *       JSON.stringify({ data: { transcript_text: idem.result } }),
 *       { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
 *     );
 *   }
 *   if (idem.kind === "in_progress") {
 *     return safeError(req, 409, "Transcription already in progress — please wait");
 *   }
 *   // otherwise proceed with the work
 */
export async function checkIdempotency<T>(
  args: IdempotentCheckArgs<T>
): Promise<IdempotentCheckResult<T, typeof args.resultColumn>> {
  const {
    client,
    table,
    recordId,
    resultColumn,
    inProgressStates,
    completedStates,
    statusColumn = "status" as keyof T & string,
  } = args;

  const { data, error } = await client
    .from(table)
    .select(`${String(statusColumn)}, ${String(resultColumn)}`)
    .eq("id", recordId)
    .maybeSingle();

  if (error || !data) return { kind: "not_started" };

  const row = data as Record<string, unknown>;
  const status = row[statusColumn] as string;

  if (completedStates.includes(status)) {
    return {
      kind: "completed",
      result: row[resultColumn] as T[typeof resultColumn],
    };
  }
  if (inProgressStates.includes(status)) {
    return { kind: "in_progress" };
  }
  return { kind: "not_started" };
}
