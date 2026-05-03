# Supabase Security Templates

A reference repository for enforcing security-by-default in every Supabase project. Designed to be cloned during Phase 0 of any new project so that Claude Code (or any scaffolding tool) produces secure foundations automatically.

## Repo structure

```
.
├── .env.example                — Generic baseline; project-specific .env templates
│                                 are emitted by the PRD generator (see "How to use" below)
├── .env.test.example           — Test-user credentials for abuse + Playwright tests
├── .gitignore                  — Standard ignores incl. .env*, build artifacts, supabase/.temp
├── README.md                   — This file
│
├── _shared/                    — Edge function middleware (Deno runtime)
│   ├── auth.ts                 — JWT verification + user derivation; returns [user, errorResponse] tuple
│   ├── cors.ts                 — handlePreflight + corsHeaders, allowlist-based
│   ├── error-handler.ts        — safeError + withErrorHandler; sanitized responses with CORS-on-error
│   ├── rate-limit.ts           — Tiered rate limiter (auth/read/write/expensive); fail-open
│   └── validate.ts             — Zod-based request body validator
│
├── client/                     — Browser-side helpers (Service layer imports these)
│   ├── apiClient.ts            — Edge-function caller; auto-attaches JWT; 401-with-refresh; never service_role
│   └── supabaseClient.ts       — Anon-key-only Supabase client singleton
│
├── ci/                         — Continuous-integration & local hooks
│   ├── github-actions.yml      — Full security-gate pipeline
│   ├── pre-commit-hook.sh      — Fast local checks (no service_role leaks, no direct supabase.from(), no .env)
│   └── semgrep-rules.yml       — Static analysis for service_role + insecure patterns
│
├── sql/                        — Database templates
│   ├── new-table-template.sql  — Migration template with RLS + 4 user-scoped policies
│   └── rls-gate-check.sql      — Read-only verification: every table has RLS + 4 policies
│
├── storage/                    — Storage bucket templates
│   ├── create-bucket.sql       — Private bucket creation with user-scoped policies
│   └── storage-helpers.ts      — Signed URL + user-scoped upload helpers (Deno)
│
├── tests/
│   └── abuse-test.ts           — Generic abuse test suite (cross-user isolation, JWT bypass, rate limits)
│
├── examples/
│   └── create-item/index.ts    — Reference edge function using the full middleware chain
│
└── docs/
    ├── query-for-existing-apps.md       — How to retrofit these templates into an existing app
    ├── security-architecture-section.md — Drop-in PRD section
    └── security-checklist-section.md    — Definition-of-done checklist for PRDs
```

## How to use with the PRD generator

Phase 0 of every PRD-generated project clones this repo and copies the relevant files into the new project. Setup commands (taken from the generated `claude.md`):

```bash
# 1. Clone
git clone https://github.com/atibadesouza/Security-Repo /tmp/security-templates

# 2. Edge function middleware
cp -r /tmp/security-templates/_shared/         supabase/functions/_shared/

# 3. Browser helpers (Service layer)
cp    /tmp/security-templates/client/supabaseClient.ts src/lib/supabaseClient.ts
cp    /tmp/security-templates/client/apiClient.ts      src/lib/apiClient.ts

# 4. Storage helpers (only if PRD §6.5 declares storage)
cp    /tmp/security-templates/storage/storage-helpers.ts supabase/functions/_shared/storage-helpers.ts
# Use storage/create-bucket.sql as the template for your bucket migration

# 5. CI + git hooks
mkdir -p .github/workflows .semgrep
cp    /tmp/security-templates/ci/github-actions.yml .github/workflows/security-checks.yml
cp    /tmp/security-templates/ci/semgrep-rules.yml  .semgrep/semgrep-rules.yml
cp    /tmp/security-templates/ci/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# 6. Tests
cp    /tmp/security-templates/tests/abuse-test.ts tests/abuse-test.ts

# 7. Repo hygiene + env baseline
cp    /tmp/security-templates/.gitignore        .gitignore
cp    /tmp/security-templates/.env.example      .env.example
cp    /tmp/security-templates/.env.test.example .env.test.example
```

If you came from the PRD generator, prefer the project-specific `env-templates.md` artifact over the generic `.env.example` here — it adds every integration credential from PRD §4 with comments.

## Core principles (enforced by these templates)

1. **Browser uses anon key only.** All data access goes through RLS.
2. **Identity is never passed from client.** Always derived from the JWT via `auth.uid()` (DB) or `requireAuth()` (edge functions).
3. **No service_role in app code.** Allowed in `scripts/` (local admin) and inside `_shared/rate-limit.ts` (rate-limit table only). Never in components, pages, services, or returned to clients.
4. **Every edge function verifies auth → rate limits → validates input → uses user-scoped queries → returns sanitized responses.** No exceptions.
5. **Every user-data table ships with RLS and all four policies.** `sql/rls-gate-check.sql` enforces this in CI.
6. **Storage is private-by-default with user-scoped paths.** Signed URLs only.
7. **All inputs validated with Zod before touching the DB.** Schema-first, fail-fast.
8. **CI blocks deployment if any security gate fails.** No overrides.

## Adapting templates

Every template file contains `-- ADAPT:` or `// ADAPT:` comments marking the parts you change per project. Everything else stays as-is. Per-project customization is also documented in the generated `claude.md` for that project.

## File reference

| File | What it does | Touches RLS? |
|------|-------------|-------------|
| `_shared/auth.ts` | JWT verification; `requireAuth()` returns `[user, Response \| null]` tuple. `createUserClient(req)` returns a Supabase client scoped to the user's JWT. | Reads JWT, never overrides RLS |
| `_shared/cors.ts` | Allowlist-based CORS. `handlePreflight(req)` and `corsHeaders(req)`. | No DB |
| `_shared/error-handler.ts` | `safeError(req, status, msg)` + `withErrorHandler(handler)`. Sanitizes errors, attaches CORS headers. | No DB |
| `_shared/rate-limit.ts` | Tiered limiter. Reads/writes only `<slug>_rate_limits`. Fail-open semantics. | Reads/writes its own infrastructure table |
| `_shared/validate.ts` | Zod request-body validation. 100KB body limit. | No DB |
| `client/supabaseClient.ts` | Browser singleton with anon key only. Throws at import time if env vars missing. | All queries through this go through RLS |
| `client/apiClient.ts` | `apiCall(functionName, options)` — attaches JWT, retries once on 401-after-refresh, returns `{ data, error }`. | No direct DB |
| `sql/new-table-template.sql` | Template for any new RLS-protected table. **Defines** policies. | Defines RLS policies |
| `sql/rls-gate-check.sql` | Read-only CI assertion. Reads `pg_tables` + `pg_policies`. | **Verifies only** — does not create |
| `storage/create-bucket.sql` | Private bucket + 4 user-scoped policies template. | Defines storage policies |
| `storage/storage-helpers.ts` | `uploadToUserFolder`, `signedUrlFor`, `deleteUserObjects`. Path validation as defense-in-depth. | No DB; storage RLS via paths |
| `tests/abuse-test.ts` | Cross-user isolation, JWT bypass, rate limit triggering. Uses service_role for fixture setup only. | Reads via service_role for setup; verifies RLS holds |
| `ci/github-actions.yml` | Pipeline: typecheck → semgrep → rls-gate-check → abuse-test. | Runs gate-check |
| `ci/pre-commit-hook.sh` | Local fast checks: no hardcoded service_role JWTs, no `service_role` outside `scripts/`, no direct `supabase.from(` outside `lib/services/`, no real `.env` files staged, typecheck. | No DB |
| `ci/semgrep-rules.yml` | Static patterns flagging insecure code. | No DB |
| `examples/create-item/index.ts` | Reference edge function showing the full middleware chain end-to-end. | Demonstrates RLS-correct queries |

## Versioning

Pin in your project by referencing this repo's commit SHA in the `claude.md` clone command, or copy the files in once and re-vendor as needed. The templates are designed to be stable; significant breaking changes will land on a `next` branch first.
