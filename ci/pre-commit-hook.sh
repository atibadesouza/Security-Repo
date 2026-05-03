#!/usr/bin/env bash
# =============================================================================
# PRE-COMMIT HOOK — fast local security checks before every commit
# =============================================================================
# Install once into a project:
#   cp ci/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# What it checks (fast — runs on staged files only):
#   1. No hardcoded service_role key strings in source
#   2. No `service_role` references outside /scripts (where they're allowed)
#   3. No raw `supabase.from(` calls outside lib/services (Service-layer rule)
#   4. No `.env*` file accidentally staged (except .env.example, .env.test.example)
#   5. TypeScript typecheck clean (if tsconfig.json present)
#
# Each check is independent — the hook reports ALL failures, not just the
# first, then exits non-zero. This avoids the back-and-forth of fix one,
# discover the next, repeat.
#
# To bypass in a genuine emergency: `git commit --no-verify`. Use sparingly.
# =============================================================================

set -uo pipefail
fail_count=0
RED=$'\033[0;31m'
YELLOW=$'\033[0;33m'
GREEN=$'\033[0;32m'
RESET=$'\033[0m'

staged_files() {
  git diff --cached --name-only --diff-filter=ACM "$@"
}

# -----------------------------------------------------------------------------
# Check 1: hardcoded service_role JWT strings
# -----------------------------------------------------------------------------
service_role_jwts=$(staged_files | xargs -I{} grep -lE 'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.' {} 2>/dev/null | xargs -I{} grep -lE '"role":"service_role"|service[_-]role' {} 2>/dev/null)
if [ -n "$service_role_jwts" ]; then
  echo "${RED}[FAIL]${RESET} Possible hardcoded service_role JWT in:"
  echo "$service_role_jwts" | sed 's/^/   /'
  fail_count=$((fail_count + 1))
fi

# -----------------------------------------------------------------------------
# Check 2: `service_role` references outside /scripts
# -----------------------------------------------------------------------------
service_role_refs=$(staged_files '*.ts' '*.tsx' '*.js' '*.mjs' \
  | grep -v -E '^scripts/' \
  | grep -v -E '^supabase/functions/_shared/' \
  | grep -v -E '/CLAUDE\.md$' \
  | xargs -I{} grep -lE '\bSUPABASE_SERVICE_ROLE_KEY\b|\bservice_role\b' {} 2>/dev/null || true)
if [ -n "$service_role_refs" ]; then
  echo "${RED}[FAIL]${RESET} \`service_role\` referenced outside /scripts and edge-function _shared/:"
  echo "$service_role_refs" | sed 's/^/   /'
  echo "        service_role bypasses RLS and must NEVER appear in app or component code."
  fail_count=$((fail_count + 1))
fi

# -----------------------------------------------------------------------------
# Check 3: `supabase.from(` outside lib/services (Service-layer rule)
# -----------------------------------------------------------------------------
direct_db_calls=$(staged_files '*.ts' '*.tsx' \
  | grep -v -E '^src/lib/services/' \
  | grep -v -E '^supabase/functions/' \
  | grep -v -E '^scripts/' \
  | grep -v -E '^tests/' \
  | xargs -I{} grep -lE 'supabase\.from\(|supabase\.rpc\(' {} 2>/dev/null || true)
if [ -n "$direct_db_calls" ]; then
  echo "${RED}[FAIL]${RESET} Direct \`supabase.from(\` or \`supabase.rpc(\` outside lib/services:"
  echo "$direct_db_calls" | sed 's/^/   /'
  echo "        Presentation layer must call a Service-layer function instead."
  fail_count=$((fail_count + 1))
fi

# -----------------------------------------------------------------------------
# Check 4: real .env files staged
# -----------------------------------------------------------------------------
env_files=$(staged_files | grep -E '^\.env(\.|$)' | grep -v -E '\.example$' || true)
if [ -n "$env_files" ]; then
  echo "${RED}[FAIL]${RESET} Real .env files staged for commit:"
  echo "$env_files" | sed 's/^/   /'
  echo "        Move secrets out of these files; only .env.example / .env.test.example may be committed."
  fail_count=$((fail_count + 1))
fi

# -----------------------------------------------------------------------------
# Check 5: TypeScript typecheck (only if tsconfig.json is present)
# -----------------------------------------------------------------------------
if [ -f tsconfig.json ] && command -v npx >/dev/null 2>&1; then
  echo "${YELLOW}[…]${RESET} Running tsc --noEmit..."
  if ! npx --no-install tsc --noEmit 2>&1 | tail -20; then
    echo "${RED}[FAIL]${RESET} TypeScript typecheck failed."
    fail_count=$((fail_count + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Result
# -----------------------------------------------------------------------------
if [ "$fail_count" -gt 0 ]; then
  echo
  echo "${RED}Pre-commit hook FAILED with $fail_count violation(s).${RESET}"
  echo "Fix the issues above and re-stage. To bypass in an emergency: git commit --no-verify"
  exit 1
fi

echo "${GREEN}[ok]${RESET} Pre-commit checks passed."
exit 0
