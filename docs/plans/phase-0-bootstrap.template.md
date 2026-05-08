# Phase 0 — Bootstrap

**Status:** Pending
**Generator:** This file is shipped by Security-Repo's
`docs/plans/phase-0-bootstrap.template.md`. Phase 0 copies it to
`docs/plans/<YYYY-MM-DD>-phase-0-bootstrap.md` and executes the steps.

## Goal

Bring this project to the point where Phase 1 (feature build) can
begin safely. Phase 0 is non-negotiable — every step is a hard gate.

## Steps

1. **Build Readiness Checklist.** Read PRD §0 and confirm every item
   with the user. Get explicit "yes" on each before continuing.
2. **Run setup commands** from CLAUDE.md §2 in order. Do NOT skip
   any step. Each command's output goes in this plan's "Output log"
   section below.
3. **Pick the dev port.** Write `PORT=<n>` to `.env.local`. Default
   to 3000 unless something else is occupying it. Run `npm run dev`
   once to confirm it starts. The CORS allowlist covers 3000-3010,
   so any port in that range is fine.
4. **Set Supabase secrets.** At minimum:
   - `RATE_LIMITS_TABLE=<slug>_rate_limits` (REQUIRED — `_shared/rate-limit.ts`
     throws at module load otherwise)
   - Every `[INTEGRATION_CREDENTIAL_*]` named in PRD §4.
   - `ALERT_NOTIFIER_SECRET` if Observability Tier 2.
   Verify with `supabase secrets list`.
5. **Create test users.** Run `node scripts/create-test-users.mjs`,
   then apply `supabase/seed.runnable.sql` to the local DB.
6. **Run `node scripts/verify-login-flow.mjs`.** This MUST PASS
   before Phase 1 starts. The most common failures and their root
   causes:
   - Browser client uses `createClient` from `@supabase/supabase-js`
     instead of `createBrowserClient` from `@supabase/ssr`.
   - Signout doesn't clear `sb-*` cookies.
   - Middleware redirects `/auth/signout` away from completion.
   - Email confirmation enabled in Supabase but disabled in dev.
7. **STOP.** Report Phase 0 complete to the user. Include:
   - Which port was chosen.
   - Which test users exist (emails only, never passwords).
   - Which secrets were set in Supabase.
   - Output of `verify-login-flow.mjs`.
   Wait for explicit user confirmation: "Proceed to Phase 1."

## Definition of done

- [ ] Build Readiness items all checked.
- [ ] Setup commands ran without error.
- [ ] `npm run dev` starts on the chosen port.
- [ ] `supabase secrets list` shows every required secret.
- [ ] `node scripts/verify-login-flow.mjs` passes.
- [ ] User has confirmed: "Proceed to Phase 1."

## Output log

_(Phase 0 fills this in as it executes — paste command outputs and
notes here. The completed log becomes the audit trail for the
bootstrap.)_
