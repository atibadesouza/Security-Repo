// =============================================================================
// SERVER API CLIENT — for invoking edge functions from Server Actions
// =============================================================================
// SERVER-ONLY. Reads the session via Next.js `cookies()` (through the server
// Supabase client) and attaches the access token as the Authorization header.
// Use from Server Actions, Route Handlers, and Server Components.
//
// MUST NOT be imported from Client Components — it depends on `next/headers`
// which is server-only.
//
// For Client Components, use `browserApiCall` from `./apiClient.ts` instead.
// =============================================================================

import { createServerSupabaseClient } from "./supabaseServerClient";

export interface ServerApiSuccess<T> {
  data: T;
  error: null;
}

export interface ServerApiFailure {
  data: null;
  error: string;
}

export type ServerApiResult<T> = ServerApiSuccess<T> | ServerApiFailure;

interface ServerApiCallOptions {
  /** HTTP method — defaults to POST */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Extra headers (merged on top of Authorization + Content-Type) */
  headers?: Record<string, string>;
  /** Abort signal for cancellable requests */
  signal?: AbortSignal;
}

/**
 * Invokes an edge function by name with the user's JWT attached, reading
 * the session from request cookies.
 *
 * - Function name = the slug-prefixed name from PRD §5
 *   (e.g., "rcv_create_recipe").
 * - Returns a typed result `{ data, error }` — never throws.
 *   Callers narrow on `result.error` (truthy = failure).
 * - 401 means the session was missing or expired; the caller should redirect
 *   to login rather than retry.
 *
 * Usage from a Server Action:
 *
 *   "use server";
 *   import { serverApiCall } from "@/lib/serverApiClient";
 *
 *   export async function createRecipe(input: CreateRecipeInput) {
 *     return serverApiCall<{ id: string }>("rcv_create_recipe", input);
 *   }
 */
export async function serverApiCall<T>(
  functionName: string,
  body: unknown,
  options: ServerApiCallOptions = {}
): Promise<ServerApiResult<T>> {
  const { method = "POST", headers: extraHeaders = {}, signal } = options;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: "Not authenticated" };
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl) {
    return { data: null, error: "Missing NEXT_PUBLIC_SUPABASE_URL" };
  }

  const url = `${projectUrl}/functions/v1/${functionName}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: method === "GET" ? undefined : JSON.stringify(body),
      signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          data: null,
          error: `Non-JSON response (${response.status}): ${text.slice(0, 200)}`,
        };
      }
    }

    if (!response.ok) {
      const message =
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : null) ?? `Request failed with status ${response.status}`;
      return { data: null, error: message };
    }

    // Most edge functions return `{ data: ... }`; unwrap if so.
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      return { data: (parsed as { data: T }).data, error: null };
    }
    return { data: parsed as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
