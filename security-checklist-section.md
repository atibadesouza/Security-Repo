# Security Checklist — Definition of Done

> Every feature, PR, and deployment must satisfy ALL items below.
> Copy this checklist into your PRD's "Acceptance Criteria" or "Definition of Done" section.
> Items marked with ⚙️ are enforced automatically by CI. Items marked with 👁️ require manual review.

## Before First Line of Code

- [ ] ⚙️ Security templates repo cloned and integrated per README
- [ ] 👁️ Supabase Auth configured: signup enabled/disabled as specified in Security Architecture
- [ ] 👁️ `.env.example` created with placeholder values (no real keys)
- [ ] ⚙️ `.gitignore` includes `.env*` patterns
- [ ] ⚙️ CI pipeline (`github-actions.yml`) configured and passing
- [ ] ⚙️ Pre-commit hook installed

## Every New Table

- [ ] ⚙️ Table includes `user_id uuid not null default auth.uid()` column
- [ ] ⚙️ `enable row level security` is in the migration
- [ ] ⚙️ SELECT, INSERT, UPDATE, DELETE policies all reference `auth.uid()`
- [ ] ⚙️ Index on `user_id` column
- [ ] ⚙️ RLS gate check passes in CI
- [ ] 👁️ No columns expose sensitive internal data to the client

## Every New Edge Function

- [ ] ⚙️ Calls `requireAuth()` — JWT verified, user derived from token
- [ ] ⚙️ Calls `rateLimit()` — appropriate tier selected
- [ ] ⚙️ Calls `validateBody()` or `validateParams()` — Zod schema defined
- [ ] ⚙️ Uses `createUserClient()` — queries run in user's RLS context
- [ ] ⚙️ Uses `safeError()` — no raw DB errors returned to client
- [ ] ⚙️ Uses `corsHeaders()` — CORS restricted to allowed origins
- [ ] ⚙️ Wrapped in `withErrorHandler()` — unhandled errors caught
- [ ] 👁️ No `user_id` accepted from request body or query params
- [ ] 👁️ Response only includes fields the client needs

## Every New Storage Bucket

- [ ] ⚙️ Bucket is private (not public)
- [ ] ⚙️ Upload paths follow `/{user_id}/{uuid}.{ext}` pattern
- [ ] ⚙️ Storage policies scope access to `auth.uid()`
- [ ] 👁️ Files accessed via signed URLs only
- [ ] 👁️ Upload size limits configured appropriately

## Every Custom Postgres Function (.rpc())

- [ ] ⚙️ Uses `SECURITY INVOKER` (not DEFINER) unless explicitly justified
- [ ] 👁️ If SECURITY DEFINER: validates `auth.uid()` internally and is documented
- [ ] 👁️ Uses parameterized inputs (no string interpolation in SQL)

## Every PR

- [ ] ⚙️ Pre-commit hook passes locally
- [ ] ⚙️ CI security gates all pass (see Security Architecture for full list)
- [ ] ⚙️ Abuse tests pass (cross-user access denied)
- [ ] 👁️ No new service_role usage introduced
- [ ] 👁️ No new secrets hardcoded

## Every Deployment

- [ ] ⚙️ All CI gates pass on `main`
- [ ] 👁️ CORS `ALLOWED_ORIGINS` updated for production domain
- [ ] 👁️ Secrets set via `supabase secrets set` (not environment files on server)
- [ ] 👁️ Email confirmation enabled in production Auth settings
- [ ] 👁️ Supabase dashboard password/2FA configured
- [ ] 👁️ Security headers configured on hosting platform

## Periodic (Monthly)

- [ ] 👁️ Review Supabase Auth settings (signup status, providers, redirect URLs)
- [ ] 👁️ Review edge function logs for unusual patterns
- [ ] 👁️ Update pinned dependency versions
- [ ] 👁️ Run `npm audit` / review Deno module versions for vulnerabilities
- [ ] 👁️ Verify rate limit thresholds match actual usage patterns
