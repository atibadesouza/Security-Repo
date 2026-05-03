// =============================================================================
// ERROR HANDLING — sanitized responses + CORS-on-error guarantee
// =============================================================================
// NEVER return raw database errors, stack traces, or third-party API error
// bodies to the client. They leak schema, table names, and internal patterns
// that attackers use to refine probes.
//
// Two helpers:
//   - safeError(req, status, msg)  — build a sanitized error Response
//   - withErrorHandler(handler)    — wrap a handler so any uncaught throw
//                                    returns a 500 with CORS headers
//
// All error responses include CORS headers automatically (via corsHeaders).
// =============================================================================

import { corsHeaders } from "./cors.ts";

/**
 * Returns a Response with a sanitized error body and CORS headers.
 * Use this for EVERY non-success path in an edge function — never `throw`,
 * never `new Response("...", { status: 500 })` directly.
 *
 * Usage:
 *   if (!body) return safeError(req, 400, "Missing request body");
 *   if (rateLimited) return safeError(req, 429, "Too many requests");
 */
export function safeError(req: Request, status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/**
 * Wraps an edge-function handler so that any uncaught error returns a 500
 * with CORS headers and a sanitized message. Logs the real error server-side
 * (visible in `supabase functions logs`) but never leaks it to the client.
 *
 * Usage:
 *   Deno.serve(withErrorHandler(async (req) => {
 *     const preflight = handlePreflight(req);
 *     if (preflight) return preflight;
 *     // ... business logic ...
 *     return new Response(...);
 *   }));
 */
export function withErrorHandler(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      // Log the real error server-side for debugging
      console.error("[unhandled-error]", {
        url: req.url,
        method: req.method,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });

      // Return a sanitized 500 to the client — NEVER expose the raw error
      return safeError(
        req,
        500,
        "An unexpected error occurred. Please try again or contact support."
      );
    }
  };
}
