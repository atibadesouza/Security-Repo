# Supabase Security Templates

A reference repository for enforcing security-by-default in every Supabase project. Designed to be referenced by PRD templates so that Claude Code (or any scaffolding tool) produces secure foundations automatically.

## How to use with PRDs

Your PRD template should include a **Security Architecture** section that references this repo:

```
## Security Architecture

Clone the security templates repo and integrate per its README:
  https://github.com/yourorg/supabase-security-templates

Required integrations:
- Copy `edge-functions/_shared/` into `/supabase/functions/_shared/`
- Copy `client/supabaseClient.ts` into `/src/lib/supabaseClient.ts`
- Copy `client/apiClient.ts` into `/src/lib/apiClient.ts`
- Copy `ci/github-actions.yml` into `.github/workflows/security-checks.yml`
- Copy `ci/pre-commit-hook.sh` and configure via `.pre-commit-config.yaml`
- Copy `ci/semgrep-rules.yml` into `.semgrep/`
- Use `sql/new-table-template.sql` as the basis for every new migration
- Run `sql/rls-gate-check.sql` in CI against the scratch DB
- Adapt `tests/abuse-test.ts` for your project's tables and functions
```

## Repo structure

```
sql/
  new-table-template.sql    — Migration template with RLS, user_id, policies
  rls-gate-check.sql        — CI query that fails if any table lacks RLS
edge-functions/
  _shared/
    auth.ts                 — JWT verification + user derivation
    rate-limit.ts           — Rate limiting middleware
    cors.ts                 — CORS headers (allowlist-based)
    validate.ts             — Zod-based input validation wrapper
    error-handler.ts        — Sanitized error responses
  example-function/
    index.ts                — Complete example using all shared modules
storage/
  create-bucket.sql         — Private bucket creation template
  storage-helpers.ts        — Signed URL + user-scoped upload helpers
client/
  supabaseClient.ts         — Anon-key-only Supabase client
  apiClient.ts              — Edge function caller (never uses service key)
tests/
  abuse-test.ts             — Cross-user access + auth bypass + rate limit tests
ci/
  github-actions.yml        — Full CI pipeline with all security gates
  pre-commit-hook.sh        — Fast local checks before commit
  semgrep-rules.yml         — Static analysis rules for service_role leaks
prd/
  security-architecture-section.md  — Drop-in PRD section
  security-checklist-section.md     — Definition-of-done checklist for PRDs
.gitignore                  — Covers .env, secrets, service_role patterns
```

## Core principles

1. **Browser uses anon key only.** All data access goes through RLS.
2. **Identity is never passed from client.** Always derived from JWT via `auth.uid()` / `getUser()`.
3. **No service_role for app data.** Removes an entire class of catastrophic failures.
4. **Every edge function verifies auth, validates input, and rate limits.** No exceptions.
5. **Every table ships with RLS and user-scoped policies.** CI enforces this.
6. **Storage is private-by-default with user-scoped paths.** Signed URLs only.
7. **All inputs are validated before touching the database.** Schema-first, fail-fast.
8. **CI blocks deployment if any security gate fails.** No overrides.

## Adapting templates

Every template file contains `-- ADAPT:` or `// ADAPT:` comments marking the parts you change per project. Everything else stays as-is.
