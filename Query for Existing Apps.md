This is an existing project with a claude.md and architecture.md already
in place. There is no separate PRD or seed SQL file.

Your job is to audit this project's security posture, retrofit the
security scaffolding, and fix gaps — without breaking existing
functionality.

# PHASE 0: UNDERSTAND THE PROJECT

1. Read claude.md completely.
2. Read architecture.md completely.
3. Read every file in supabase/migrations/ to understand the schema.
4. If there are no migration files, connect to the database and run:

   SELECT tablename FROM pg_tables WHERE schemaname = 'public';

   Then for each table:

   SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = '[table]';

5. Capture the live schema into a reference file at
   docs/current-schema.sql — this becomes our "seed SQL equivalent."
   Include: table definitions, indexes, existing policies, functions,
   triggers, and storage buckets.

6. Read the full source tree. Understand which framework is used,
   where Supabase queries live, how auth is implemented, and where
   edge functions are.

Present a summary:
- Project name and what it does (from claude.md / architecture.md)
- Framework and key dependencies
- Number of tables, edge functions, storage buckets
- Current auth implementation (how does login work today?)
- Any existing security measures already in place

WAIT for my confirmation before proceeding.

# PHASE 1: SECURITY AUDIT

Check every item below. Report as PASS / FAIL / NOT APPLICABLE
with file paths and line numbers for failures.

## Database
- [ ] Every table: RLS enabled?
- [ ] Every table: SELECT policy referencing auth.uid()?
- [ ] Every table: INSERT policy referencing auth.uid()?
- [ ] Every table: UPDATE policy referencing auth.uid()?
- [ ] Every table: DELETE policy referencing auth.uid()?
- [ ] Every user-data table: has user_id column?
- [ ] Every user_id column: has index?
- [ ] Every user_id column: has foreign key to auth.users?
- [ ] Every custom function: SECURITY INVOKER (not DEFINER)?
- [ ] Rate limits table: exists?

## Edge Functions
- [ ] Every function: calls requireAuth() or equivalent?
- [ ] Every function: validates input (Zod or similar)?
- [ ] Every function: rate limited?
- [ ] Every function: returns sanitized errors (no raw DB errors)?
- [ ] Every function: CORS restricted (not wildcard)?
- [ ] No function accepts user_id from request body?

## Client Code
- [ ] No service_role key in any frontend file?
- [ ] No hardcoded secrets (JWT patterns, API key strings)?
- [ ] Supabase client uses anon key only?
- [ ] No select("*") in production queries?
- [ ] .single() calls that should be .maybeSingle()?

## Storage
- [ ] Every bucket: private (not public)?
- [ ] Upload paths: user-scoped (/{user_id}/...)?
- [ ] File access: signed URLs only?

## Infrastructure
- [ ] .env in .gitignore?
- [ ] .env.example exists?
- [ ] No .env files committed in git history?
  (run: git log --all --full-history -- "*.env*")
- [ ] Webhook URLs: stored in DB or .env, not in code?

## Frontend
- [ ] Auth session expiry handled (no crash on 401)?
- [ ] React hooks before conditional returns?
- [ ] Loading + error states on async operations?

Present the FULL audit report and WAIT for my review.

# PHASE 2: SECURITY SCAFFOLDING

Add the security templates without modifying existing code:

1. Clone security templates repo into /tmp/security-templates
   https://github.com/yourorg/supabase-security-templates

2. For each file to be copied, check if it already exists:
   - If it does NOT exist → copy it in
   - If it DOES exist → show me a diff of the existing file vs the
     template and WAIT for my decision (keep existing / replace /
     merge)

   Files to integrate:
   - supabase/functions/_shared/auth.ts
   - supabase/functions/_shared/rate-limit.ts
   - supabase/functions/_shared/cors.ts
   - supabase/functions/_shared/validate.ts
   - supabase/functions/_shared/error-handler.ts
   - src/lib/supabaseClient.ts
   - src/lib/apiClient.ts
   - .semgrep/semgrep-rules.yml
   - .github/workflows/security-checks.yml
   - .git/hooks/pre-commit (chmod +x)
   - tests/abuse-test.ts

3. Ensure .env is in .gitignore.
4. Create .env.example if missing.

Commit: "chore: add security scaffolding"

# PHASE 3: DATABASE HARDENING

Based on the audit results, generate migration SQL for all database
fixes. Group into a SINGLE migration file.

Rules:
- ALWAYS enable RLS AND add policies in the same migration.
  Enabling RLS without policies makes all data invisible.
- If a table is missing user_id entirely, DO NOT auto-add it.
  Flag it and explain the options:
  a) Add column + backfill with a specific user's UUID
  b) Add column + leave NULL (requires policy change)
  c) This table is intentionally not user-scoped (add to allowlist)
  Ask me which option for each flagged table.
- If policies exist but are wrong (e.g., USING (true)), replace
  them with auth.uid()-scoped versions.
- Add the rate_limits table if it doesn't exist.

Show me the COMPLETE migration SQL and WAIT for approval.
After approval, apply it and run the RLS gate check:
```bash
psql $DATABASE_URL -f sql/rls-gate-check.sql --set ON_ERROR_STOP=1
```

Commit: "fix: RLS and policies on all tables"

# PHASE 4: CODE FIXES

Fix in order of severity. Each priority is a separate commit.

**Priority 1 — Critical (data exposure risk)**
- Remove service_role from client code → replace with anon key
- Remove user_id acceptance from request bodies → derive from JWT
- Remove hardcoded secrets → move to .env or Supabase secrets
- Move webhook URLs from code to database or .env

For each service_role removal: trace every query that used it.
Those queries now go through RLS. Verify the policies exist for
each table those queries touch. If they don't, go back to Phase 3
and add them FIRST.

Commit: "fix(critical): remove service_role and secrets from client"

**Priority 2 — High (auth and validation gaps)**
- Add auth verification to edge functions that lack it
  If the function currently has its own auth check (different from
  requireAuth), show me both and ask which to keep
- Add Zod input validation to edge functions
- Add rate limiting to edge functions
- Wrap edge function errors in safeError()
- Switch public buckets to private + add storage policies

Commit: "fix(high): auth, validation, rate limiting on edge functions"

**Priority 3 — Medium (code quality + resilience)**
- Replace .single() with .maybeSingle() where appropriate
- Replace select("*") with explicit column lists
- Fix React hook ordering issues
- Add loading/error states to components missing them
- Add graceful auth session expiry handling

Commit: "fix(medium): query safety and UI resilience"

# PHASE 5: TESTING

1. Install Playwright if not present:
   npm init playwright@latest -- --yes
   npx playwright install --with-deps

2. Adapt tests/abuse-test.ts for THIS project's tables and functions.
   Use the schema captured in docs/current-schema.sql to know which
   tables and edge functions to test.

3. Run abuse tests. Report results. Fix failures.

4. Run Playwright E2E tests if they exist. If none exist, create
   basic smoke tests for: login, main data view, create operation,
   logout.

5. Run the security audit skill/checklist again to verify all
   items now pass.

Commit: "test: security and E2E tests passing"

# PHASE 6: UPDATE DOCUMENTATION

1. Update architecture.md to reflect:
   - New security scaffolding files
   - Security boundaries diagram
   - Auth flow (if changed)
   - CI pipeline additions

2. Update claude.md to include:
   - All security rules from this prompt
   - Updated file map (new files added)
   - Database reference with policies
   - Edge function specs with middleware chain
   - Testing instructions

3. Create docs/current-schema.sql if not done in Phase 0
   (the complete schema dump for reference)

Commit: "docs: update architecture.md and claude.md with security"

# ABSOLUTE RULES — follow throughout

1. NEVER use service_role key in application code.
2. NEVER accept user_id from request bodies or query params.
3. NEVER create a table without RLS + all four policies.
4. NEVER create an edge function without auth + rate limit + validation.
5. NEVER create a public storage bucket.
6. NEVER return raw database errors to the client.
7. NEVER use string interpolation in SQL.
8. NEVER hardcode secrets, API keys, or webhook URLs in code.
9. NEVER use SECURITY DEFINER without explicit justification.
10. NEVER skip input validation on edge functions.
11. NEVER remove security constraints to fix errors.
12. Use .maybeSingle() not .single().
13. React hooks before conditional returns.
14. Loading + success + error states on all async operations.
15. Dates as UTC in DB, local time only in UI.
16. Commit after each phase with conventional commit messages.
17. WAIT for my approval at every checkpoint marked WAIT.
