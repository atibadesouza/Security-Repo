# Phase 0 — Bootstrap plan (template)

> Claude Code opens this FIRST. It is the runnable checklist that turns the
> generated artifacts (PRD, architecture.md, claude.md, seed.sql) into a wired,
> deployable project. Work top to bottom; check items off as you go; write an ADR
> (docs/decisions/) whenever the docs contradict each other or reality.

## 0. Reconcile before building
- [ ] Confirm ONE table prefix `[slug]_` across PRD, architecture.md, claude.md,
      and seed.sql. If they disagree, pick the PRD Data Model's prefix, fix the
      others, and record ADR-0001.
- [ ] Confirm every table the PRD/seed references is actually defined (esp.
      `[slug]_audit_log`, `[slug]_rate_limits`).

## 1. Scaffold + security templates
- [ ] Scaffold the framework (pinned versions from architecture.md — never `@latest`).
- [ ] Copy the security templates per claude.md (clients, middleware, `_shared/*`,
      verify-*.mjs, CI hooks, fixtures).
- [ ] `npm i @supabase/ssr @supabase/supabase-js`.

## 2. Database
- [ ] Apply the migration (schema + RLS + all 4 policies per table).
- [ ] Run the seed; confirm `psql -f` runs clean (no prose/fences in the file).
- [ ] `node scripts/verify-layer-boundaries.mjs` passes.

## 3. Cloud + deploy bridge (do NOT stay local-only)
- [ ] Create + `supabase link` a CLOUD project; `supabase db push --linked`.
- [ ] `gh repo create [slug] --private --source=. --push`.
- [ ] Deploy to Vercel with the CLOUD Supabase env; confirm a live URL.

## 4. Verify gates
- [ ] `node scripts/verify-login-flow.mjs`
- [ ] `node scripts/verify-cors-on-errors.mjs`
- [ ] `node scripts/verify-test-realness.mjs`
- [ ] `node scripts/verify-test-coverage.mjs`
- [ ] `psql [db-url] -f sql/rls-gate-check.sql --set ON_ERROR_STOP=1`

## 5. Fill the placeholders
- [ ] Replace every `<<REPLACE: ...>>` (Calendly, sender email, API keys, branding).
- [ ] Confirm `.env.local` / `.env.test` are gitignored.

_End state: a deployed app on a real URL, all verify gates green, no placeholders left._
