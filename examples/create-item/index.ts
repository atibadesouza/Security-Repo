// =============================================================================
// EXAMPLE EDGE FUNCTION — "create-item"
// =============================================================================
// This demonstrates the correct pattern for every edge function:
//   1. Handle CORS preflight
//   2. Require authentication (JWT → user identity)
//   3. Rate limit
//   4. Validate input
//   5. Perform user-scoped database operation
//   6. Return sanitized response
//
// ADAPT: Copy this file, rename it, and modify the schema + DB logic.
// =============================================================================

import { requireAuth, createUserClient } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { validateBody, z } from "../_shared/validate.ts";
import { safeError, withErrorHandler } from "../_shared/error-handler.ts";

// ADAPT: Define the input schema for this endpoint
const CreateItemSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  status: z.enum(["active", "archived"]).default("active"),
});

Deno.serve(
  withErrorHandler(async (req: Request) => {
    // 1. CORS preflight
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    const headers = corsHeaders(req);

    // Only allow POST for this endpoint
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    // 2. Authenticate — derive user from JWT (NEVER from request body)
    const [user, authError] = await requireAuth(req);
    if (authError) return authError;

    // 3. Rate limit
    const [_limit, limitError] = await rateLimit(user.id, "create-item", "write");
    if (limitError) return limitError;

    // 4. Validate input
    const [body, validationError] = await validateBody(req, CreateItemSchema);
    if (validationError) return validationError;

    // 5. User-scoped database operation
    // createUserClient passes the user's JWT, so RLS enforces row ownership.
    // The user_id column defaults to auth.uid() on INSERT, so we don't set it.
    // Even if someone tampered with the body to include user_id, the column
    // default + RLS WITH CHECK would reject a mismatched value.
    const supabase = createUserClient(req);

    const { data, error } = await supabase
      .from("items")
      .insert({
        name: body.name,
        description: body.description,
        status: body.status,
        // NOTE: user_id is NOT set here. It defaults to auth.uid() via the column default.
        // This is intentional. Never pass user_id from the client.
      })
      .select("id, name, description, status, created_at")
      .single();

    if (error) {
      return safeError(error, {
        status: 400,
        message: "Could not create item",
        headers,
      });
    }

    // 6. Return sanitized response
    return new Response(JSON.stringify({ data }), {
      status: 201,
      headers: { "Content-Type": "application/json", ...headers },
    });
  })
);
