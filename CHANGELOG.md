# Changelog

Generated apps may pin to a specific tag of this repo to avoid being affected by future template changes mid-build. After each tagged release, the PRD generator's `Create_Claude_md.system.md` Setup Step references the tag explicitly.

## 2026-05-08 — claude-code-pain-points

Breaking changes to the templates Claude Code consumes. Apps mid-build on the prior templates will need a manual migration; greenfield apps generated after this date pick up the new patterns automatically.

### Breaking

- **`client/supabaseClient.ts`** switched from `createClient` (`@supabase/supabase-js`, localStorage session) to `createBrowserClient` (`@supabase/ssr`, cookie session). Required because the previous client desyncs from Next.js middleware — signout "succeeded" but the user appeared authenticated on the next server request. Consumers must call the new factory `createClient()` instead of importing the singleton `supabase`.
- **`_shared/rate-limit.ts`** now throws at module load if `RATE_LIMITS_TABLE` env var is unset. Previous default `"rate_limits"` made every prefixed app silently fail-open if the secret was forgotten. Set `RATE_LIMITS_TABLE=<prefix>_rate_limits` via `supabase secrets set` before deploying.
- **`client/apiClient.ts`** now throws when called from a non-browser context (no `window`). Previously failed silently with "Not authenticated" because there was no browser session to read. Server Actions / Route Handlers / Server Components must use `serverApiCall` from the new `client/serverApiClient.ts`.

### Fixed

- **`_shared/auth.ts`, `_shared/validate.ts`** — every error `Response` now attaches `corsHeaders(req)`. A 401 / 400 / 413 without CORS surfaces in the browser as opaque "Network Error" with no status visible. Hours of debugging per build.

### Added

- **`client/supabaseServerClient.ts`** — server-side Supabase client wired to `next/headers` cookies for Server Components, Route Handlers, Server Actions.
- **`client/middleware.ts`** — drop-in `updateSession()` for Next.js middleware that refreshes the cookie session on every request.
- **`client/serverApiClient.ts`** — `serverApiCall<T>(name, body, options?)` for Server Actions / Route Handlers calling edge functions. Reads the session via `cookies()` rather than the browser store.
- **`_shared/idempotency.ts`** — `checkIdempotency()` for edge functions that create or update long-running records. Returns stored result on completed, 409 on in-progress, proceeds on not-started. Replaces the recurring "double-click creates two records" bug pattern.
- **`scripts/_supabase-node-client.mjs`** — `createNodeAdminClient()` for Node.js scripts (test bootstrap, seeders). Lazy-loads `ws` for Realtime support.

### Migration for in-flight projects

1. Add `@supabase/ssr` as a dependency: `npm i @supabase/ssr`.
2. Replace `import { supabase } from "@/lib/supabaseClient"` with `import { createClient } from "@/lib/supabaseClient"; const supabase = createClient();` at every browser call site.
3. Add `src/lib/supabase/server.ts` and `src/middleware.ts` from the new templates.
4. Find every Server Action / Route Handler that calls `apiCall(...)` and switch to `serverApiCall(...)` (re-import path differs).
5. Set `RATE_LIMITS_TABLE` Supabase secret.
6. Audit `_shared/*.ts` files that you've customized — every error `Response` needs `...corsHeaders(req)` in its headers.
