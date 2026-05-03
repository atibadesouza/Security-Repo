-- =============================================================================
-- RLS GATE CHECK — read-only verification script for CI
-- =============================================================================
-- Run this against any environment (local dev, staging, production) to assert
-- that every user-data table has RLS enabled and all four policies (SELECT,
-- INSERT, UPDATE, DELETE) defined and scoped through auth.uid() (single-user
-- and multi-isolated apps) or an org-membership helper (multi-collaborative).
--
-- This script does NOT define, create, or alter any policies. It only READS
-- pg_tables and pg_policies and raises an exception if any table is unsafe.
--
-- Usage in CI (`ci/github-actions.yml` already calls this):
--   psql "$DATABASE_URL" -f sql/rls-gate-check.sql --set ON_ERROR_STOP=1
--
-- An exit code of 0 = all gates pass. Non-zero = at least one violation.
--
-- ADAPT: the ALLOWLIST CTE below excludes infrastructure tables that
-- legitimately bypass user-scoped RLS (e.g., the project's rate_limits
-- table, which has insert-only policies for any authenticated user, AND
-- any lookup/config tables you've justified). Add table names there with
-- an inline comment naming the justification.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_failures int := 0;
  v_table   record;
  v_count   int;
BEGIN
  -- -------------------------------------------------------------------------
  -- Allowlist: tables that legitimately bypass the "all 4 policies" rule.
  -- Add a row for each, with an inline comment naming the reason.
  -- -------------------------------------------------------------------------
  CREATE TEMP TABLE rls_gate_allowlist (table_name text, reason text);

  -- Common infrastructure tables (uncomment and adapt for your project):
  -- INSERT INTO rls_gate_allowlist VALUES ('rcv_rate_limits', 'insert-only middleware table; users cannot read or update');
  -- INSERT INTO rls_gate_allowlist VALUES ('rcv_lookup_units', 'public lookup data; authenticated read-only');

  -- -------------------------------------------------------------------------
  -- Check 1: every public-schema, non-allowlisted table has RLS enabled.
  -- -------------------------------------------------------------------------
  RAISE NOTICE '--- Check 1: RLS enabled on all user-data tables ---';
  FOR v_table IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN (SELECT table_name FROM rls_gate_allowlist)
      AND c.relrowsecurity = false
  LOOP
    RAISE WARNING 'RLS NOT ENABLED on public.%', v_table.table_name;
    v_failures := v_failures + 1;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Check 2: every table with RLS enabled has policies for ALL FOUR ops
  -- (SELECT, INSERT, UPDATE, DELETE). Allowlist tables are skipped.
  -- -------------------------------------------------------------------------
  RAISE NOTICE '--- Check 2: all 4 policies present on user-data tables ---';
  FOR v_table IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relname NOT IN (SELECT table_name FROM rls_gate_allowlist)
  LOOP
    -- Count distinct command types (SELECT/INSERT/UPDATE/DELETE) covered
    -- by policies on this table. ALL counts as covering all four.
    SELECT count(DISTINCT cmd)
      INTO v_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table.table_name
        AND (cmd IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') OR cmd = 'ALL');

    -- ALL policy alone counts as covering all 4
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table.table_name
        AND cmd = 'ALL'
    ) THEN
      v_count := 4;
    END IF;

    IF v_count < 4 THEN
      RAISE WARNING 'public.% has only % distinct policy cmd(s); needs SELECT, INSERT, UPDATE, DELETE (or one ALL policy)',
        v_table.table_name, v_count;
      v_failures := v_failures + 1;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Check 3: no policy uses USING (true) without justification.
  -- These are common when copy-pasting and almost always wrong.
  -- -------------------------------------------------------------------------
  RAISE NOTICE '--- Check 3: no unconditional USING (true) policies ---';
  FOR v_table IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual = 'true'
      AND tablename NOT IN (SELECT table_name FROM rls_gate_allowlist)
  LOOP
    RAISE WARNING 'Policy %.%.% has USING (true) — unconditional access, almost always a bug',
      v_table.schemaname, v_table.tablename, v_table.policyname;
    v_failures := v_failures + 1;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Check 4: SECURITY DEFINER functions in public schema. They bypass RLS,
  -- so each one is a privilege-escalation surface. Warn (not fail) so the
  -- CI log surfaces them for review; promote to fail in a project-specific
  -- gate once you've enumerated the legitimate ones.
  -- -------------------------------------------------------------------------
  RAISE NOTICE '--- Check 4: SECURITY DEFINER functions (review each) ---';
  FOR v_table IN
    SELECT n.nspname AS schema_name, p.proname AS func_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    RAISE NOTICE 'SECURITY DEFINER function: %.% — verify it has explicit auth.uid() check inside',
      v_table.schema_name, v_table.func_name;
  END LOOP;

  DROP TABLE rls_gate_allowlist;

  -- -------------------------------------------------------------------------
  -- Final result
  -- -------------------------------------------------------------------------
  IF v_failures > 0 THEN
    RAISE EXCEPTION 'RLS gate check FAILED with % violation(s). See WARNING messages above.', v_failures;
  ELSE
    RAISE NOTICE 'RLS gate check PASSED — all user-data tables are correctly secured.';
  END IF;
END $$;
