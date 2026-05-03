// =============================================================================
// CORS HELPERS
// =============================================================================
// Every edge function — success OR error, early-return OR 500 — must return
// CORS headers. A response without them breaks the browser's preflight
// contract and produces opaque "Network Error" messages in the client even
// when the status code is correct.
//
// Pattern (mandatory, top of every Deno.serve handler):
//
//   const preflight = handlePreflight(req);
//   if (preflight) return preflight;          // CORS on OPTIONS
//
//   const headers = corsHeaders(req);         // reuse in EVERY response below
//   return new Response(body, { status, headers: { ...headers, "Content-Type": "application/json" } });
//
// ADAPT the ALLOWED_ORIGINS list below for your project: include your
// production domain and any preview-URL pattern you use. NEVER use "*"
// in production.
// =============================================================================

const ALLOWED_ORIGINS: ReadonlyArray<string | RegExp> = [
  "http://localhost:3000",      // Next.js dev
  "http://localhost:5173",      // Vite dev
  "http://localhost:8000",      // misc local
  // ADAPT: add your production domain, e.g.:
  // "https://app.example.com",
  // ADAPT: Vercel preview-URL pattern (uncomment and tighten as needed):
  // /^https:\/\/[a-z0-9-]+-yourteam\.vercel\.app$/,
];

const ALLOWED_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
const ALLOWED_HEADERS =
  "Authorization, Content-Type, X-Client-Info, apikey, X-Webhook-Signature";

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.some((allowed) =>
    typeof allowed === "string" ? allowed === origin : allowed.test(origin)
  );
}

/**
 * Builds the CORS headers to attach to a Response. Echoes the request's
 * Origin if it's in the allowlist, otherwise omits Access-Control-Allow-Origin
 * (forcing the browser to block the response, which is the correct failure
 * mode — never reflect an unknown origin).
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = isAllowedOrigin(origin);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

/**
 * Handles the CORS preflight OPTIONS request. Returns a 204 Response with
 * the appropriate CORS headers if the request method is OPTIONS; otherwise
 * returns null (caller proceeds with normal handler).
 *
 * Usage at the top of every edge function:
 *
 *   const preflight = handlePreflight(req);
 *   if (preflight) return preflight;
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req),
  });
}
