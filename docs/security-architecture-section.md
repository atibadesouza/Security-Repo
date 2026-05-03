# Security Architecture

> **Instructions for PRD authors:** Copy this section into every PRD. Replace
> items marked ADAPT with project-specific values. Do not remove any section —
> if a section doesn't apply, mark it "N/A" with a reason.
>
> **Instructions for Claude Code / implementers:** Clone the security templates
> repo and integrate all referenced artifacts before writing any application code.

## Security Templates Repository

All security artifacts referenced below live in:
**https://github.com/yourorg/supabase-security-templates** ← ADAPT: your repo URL

Clone this repo and integrate per its README as the FIRST implementation step,
before any feature code is written.

## Authentication Model

- **Client-side:** Uses Supabase anon key ONLY (`client/supabaseClient.ts` template)
- **Identity derivation:** ALWAYS from JWT via `auth.uid()` (database) or `getUser()` (edge functions). NEVER from request body, query params, or client-provided values.
- **Service role key:** NOT USED for application data. Reserved only for isolated admin maintenance functions (if any). CI will fail if service_role appears in client code.
- **Signup configuration:** ADAPT — specify whether signup is open or disabled. For single-user apps, disable public signup after the owner account is created.
- **JWT expiry:** ADAPT — specify the session duration appropriate for this app.
- **Email confirmation:** Required in production. May be disabled in development.

## Row Level Security (RLS)

- Every table storing user data MUST have RLS enabled.
- Every table MUST have policies scoped to `auth.uid()` for SELECT, INSERT, UPDATE, DELETE.
- Use `sql/new-table-template.sql` as the basis for every new migration.
- CI runs `sql/rls-gate-check.sql` to verify RLS is enabled and policies are scoped.
- No table ships without RLS. No exceptions. No "we'll add it later."

## Edge Functions

- Every edge function MUST follow the standard wrapper pattern in `edge-functions/_shared/`:
  1. Handle CORS preflight (`cors.ts`)
  2. Verify JWT and derive user identity (`auth.ts` → `requireAuth()`)
  3. Apply rate limiting (`rate-limit.ts` → `rateLimit()`)
  4. Validate all input against a Zod schema (`validate.ts` → `validateBody()`)
  5. Perform user-scoped database operation using `createUserClient()`
  6. Return sanitized errors only (`error-handler.ts` → `safeError()`)
- CI will fail if any edge function is missing `requireAuth()` or `rateLimit()`.

## Input Validation

- Every edge function that accepts a request body MUST validate it with Zod BEFORE any database interaction.
- Validation schemas must specify:
  - Field types (string, number, enum, etc.)
  - Length/size constraints (min, max)
  - Allowed values (enums, patterns)
  - Required vs optional fields
- Request bodies exceeding 100KB are rejected automatically.
- Invalid input returns 400 with field-level error messages (no internal details).

## Storage

- All buckets are PRIVATE by default. No public buckets for user content.
- Object paths follow the pattern: `/{user_id}/{uuid}.{ext}` — enforced by storage policies.
- Files are accessed via signed URLs only.
- Use `storage/create-bucket.sql` for bucket creation and `storage/storage-helpers.ts` for upload/download operations.
- CI will flag any public bucket declaration in migrations.

## Database Functions

- All custom Postgres functions MUST use `SECURITY INVOKER` (not `SECURITY DEFINER`).
- If `SECURITY DEFINER` is required, it must be explicitly documented with a justification and must validate `auth.uid()` internally.
- CI runs the RLS gate check which flags unauthorized `SECURITY DEFINER` functions.

## Secrets Management

- All secrets are managed via `supabase secrets set` (edge functions) or environment variables (frontend anon key only).
- No secrets are hardcoded in source code. CI scans for JWT patterns and key prefixes.
- `.env` files are in `.gitignore`. Only `.env.example` (with placeholder values) is committed.

## Realtime

- ADAPT: Specify whether this project uses Supabase Realtime.
- If yes: Realtime is disabled on all tables by default. Enable only on specific tables with explicit policy review documented here.
- If no: Realtime remains disabled.

## Security Headers (Frontend)

The frontend application MUST set the following HTTP headers:
- `Content-Security-Policy` — restrict script and resource origins
- `X-Frame-Options: DENY` — prevent clickjacking
- `Strict-Transport-Security` — enforce HTTPS
- `X-Content-Type-Options: nosniff`

ADAPT: Specify the CSP policy appropriate for this project's dependencies.

## CORS

- Development: localhost origins are allowed.
- Production: CORS is restricted to the project's specific domains. No wildcards.
- Configured in `edge-functions/_shared/cors.ts` — update the `ALLOWED_ORIGINS` list.

## Rate Limiting

Rate limits are applied to every edge function:
- Auth endpoints: 5 requests / 60 seconds
- Expensive operations (AI, search): 10 requests / 60 seconds
- Normal writes: 30 requests / 60 seconds
- Normal reads: 60 requests / 60 seconds

ADAPT: Adjust these limits based on expected usage patterns.

## Logging

- Failed authentication attempts are logged server-side (edge function console).
- Rate limit triggers are logged.
- Database errors are logged server-side but NOT returned to the client.
- ADAPT: Specify any additional audit logging requirements.

## Dependency Security

- Deno edge function imports use pinned versions (not `@latest`).
- npm dependencies use `package-lock.json` for deterministic installs.
- ADAPT: Specify whether `npm audit` or `deno check` is required in CI.

## CI Security Gates

The following checks run on every PR and block merge if they fail:

| Gate | Check | Tool |
|------|-------|------|
| 1 | RLS enabled on all tables | `rls-gate-check.sql` |
| 2 | All policies scoped to `auth.uid()` | `rls-gate-check.sql` |
| 3 | No service_role in client code | grep + semgrep |
| 4 | Every edge function calls `requireAuth()` + `rateLimit()` | grep |
| 5 | No public storage buckets | grep |
| 6 | No hardcoded secrets | grep + semgrep |
| 7 | Cross-user abuse tests pass | `abuse-test.ts` |
| 8 | Input validation present in edge functions | grep |
| 9 | No unauthorized SECURITY DEFINER functions | `rls-gate-check.sql` |

See `ci/github-actions.yml` for the full pipeline.
