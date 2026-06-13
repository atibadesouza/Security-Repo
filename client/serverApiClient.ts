// =============================================================================
// SERVER API CLIENT — invoke edge functions from server contexts
// =============================================================================
// The server-side counterpart to `apiClient.ts`. Use it from Server Actions and
// Route Handlers, where the JWT comes from the request cookies (via the SSR
// server client) rather than browser localStorage. Same `{ data, error }`
// contract; never throws.
//
// Requires: @supabase/ssr (for supabaseServerClient). Copy target (per
// claude.md): src/lib/serverApiClient.ts
//
// SECURITY: forwards the USER's JWT — the edge function still runs under that
// user's identity + RLS. This is NOT a service_role backdoor. Service-role work
// stays inside the edge function, never in the caller.
// =============================================================================

import { supabaseServerClient } from "./supabaseServerClient";

export type ServerApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { status: number; message: string } };

interface ServerApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Calls edge function `functionName` with the current request's user JWT.
 *
 *   "use server";
 *   import { serverApiCall } from "@/lib/serverApiClient";
 *   export async function archiveAction(id: string) {
 *     return serverApiCall<{ ok: true }>("app_archive", { body: { id } });
 *   }
 */
export async function serverApiCall<T>(
  functionName: string,
  options: ServerApiOptions = {}
): Promise<ServerApiResult<T>> {
  const { method = "POST", body, headers: extra = {} } = options;

  const supabase = await supabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = `${baseUrl}/functions/v1/${functionName}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { data: null, error: { status: 0, message: err instanceof Error ? err.message : "Network error" } };
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { data: null, error: { status: response.status, message: text.slice(0, 200) } };
    }
  }

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    return { data: null, error: { status: response.status, message } };
  }

  if (parsed && typeof parsed === "object" && "data" in parsed) {
    return { data: (parsed as { data: T }).data, error: null };
  }
  return { data: parsed as T, error: null };
}
