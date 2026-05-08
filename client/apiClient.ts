// =============================================================================
// BROWSER API CLIENT — for invoking edge functions from Client Components
// =============================================================================
// BROWSER-ONLY. Reads the session from the browser Supabase client (which uses
// cookies via @supabase/ssr). Attaches the user's JWT, handles 401-with-
// refresh, parses sanitized errors, and returns a typed result.
//
// For Server Actions, Route Handlers, or Server Components calling an edge
// function, use `serverApiCall` from `./serverApiClient.ts` instead — it
// reads the session via Next.js `cookies()` rather than the browser store.
// Calling `apiCall` server-side throws because there is no browser session
// to read.
//
// Two browser consumers:
//   1. Service layer (`src/lib/services/*`) calls this when an operation
//      requires server-side computation, third-party API access, or
//      service_role privileges (those live in the edge function).
//   2. Client Components MAY call this directly for fire-and-forget actions
//      (e.g., delete confirmation), but most actions go through Server
//      Actions or Service-layer wrappers.
// =============================================================================

import { createClient } from "./supabaseClient";

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiFailure {
  data: null;
  error: {
    status: number;
    message: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

interface ApiCallOptions {
  /** HTTP method — defaults to POST */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Request body (will be JSON.stringified) */
  body?: unknown;
  /** Extra headers (merged on top of Authorization + Content-Type) */
  headers?: Record<string, string>;
  /** Abort signal for cancellable requests */
  signal?: AbortSignal;
}

/**
 * Invokes an edge function by name with the user's JWT attached.
 *
 * - Function name = the slug-prefixed name from PRD §5
 *   (e.g., "rcv_create_recipe").
 * - Returns a typed result `{ data, error }` — never throws.
 *   Callers narrow on `result.error` (truthy = failure).
 * - On 401, attempts ONE silent refresh via Supabase auth, then retries.
 *   If the retry still 401s, returns the failure to the caller.
 *
 * Usage from a Service-layer function:
 *
 *   import { apiCall } from "@/lib/apiClient";
 *
 *   export async function createRecipe(input: CreateRecipeInput) {
 *     return apiCall<{ id: string }>("rcv_create_recipe", { body: input });
 *   }
 */
export async function browserApiCall<T>(
  functionName: string,
  options: ApiCallOptions = {}
): Promise<ApiResult<T>> {
  if (typeof window === "undefined") {
    throw new Error(
      "browserApiCall is browser-only. From Server Actions, Route Handlers, " +
        "or Server Components, use `serverApiCall` from " +
        "`@/lib/serverApiClient` instead — it reads the session via " +
        "next/headers cookies rather than the browser store."
    );
  }

  const { method = "POST", body, headers: extraHeaders = {}, signal } = options;
  const supabase = createClient();

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? "";
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };
  };

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = `${projectUrl}/functions/v1/${functionName}`;

  const doFetch = async (): Promise<Response> => {
    return fetch(url, {
      method,
      headers: await buildHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  };

  let response: Response;
  try {
    response = await doFetch();
  } catch (err) {
    return {
      data: null,
      error: {
        status: 0,
        message: err instanceof Error ? err.message : "Network error",
      },
    };
  }

  // 401 → try one silent refresh, then retry once
  if (response.status === 401) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) {
      try {
        response = await doFetch();
      } catch (err) {
        return {
          data: null,
          error: {
            status: 0,
            message: err instanceof Error ? err.message : "Network error after refresh",
          },
        };
      }
    }
  }

  // Try to parse JSON; tolerate empty bodies (e.g., 204)
  let parsed: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON body — surface it as an error message
      return {
        data: null,
        error: {
          status: response.status,
          message: text.slice(0, 200),
        },
      };
    }
  }

  if (!response.ok) {
    const message =
      (parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ?? `Request failed with status ${response.status}`;
    return {
      data: null,
      error: { status: response.status, message },
    };
  }

  // Success — most edge functions return `{ data: ... }`; unwrap if so.
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    return {
      data: (parsed as { data: T }).data,
      error: null,
    };
  }

  return { data: parsed as T, error: null };
}

/**
 * Backwards-compat alias for `browserApiCall`. New code should import
 * `browserApiCall` directly so the browser-only constraint is visible at
 * the call site. Both names enforce the same runtime check, so server-side
 * imports fail loudly with a redirect to `serverApiCall`.
 */
export function apiCall<T>(
  functionName: string,
  options: ApiCallOptions = {}
): Promise<ApiResult<T>> {
  return browserApiCall<T>(functionName, options);
}

