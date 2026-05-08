#!/usr/bin/env node
// scripts/verify-test-realness.mjs
//
// Static analysis on tests/e2e/*.spec.ts. Pattern-matching only —
// not type-aware — but catches the most common "fake test" patterns
// empirically. The 80% case where Claude wrote a "test" that doesn't
// exercise anything.
//
// Per-category rules (category inferred from filename):
//
//   upload    — must have setInputFiles( AND a storage.from(... .list(
//   form      — must have page.click( on submit AND from(...).select(
//   auth      — must have page.fill('[name=email] AND a session/cookie check
//   any       — at least one expect(page. AND at least one DB query
//
// Anti-patterns flagged in any spec:
//   - No page.click / page.fill / setInputFiles → spec doesn't interact
//   - Only isVisible() / not.toBeNull() assertions → "renders ≠ works"
//   - Every fetch is mocked → spec tests the mock, not the backend
//   - Spec named *upload* without setInputFiles
//
// Exits 0 if no anti-patterns. Exits 1 with a per-spec report.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "tests/e2e";

function* walkSpecs(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkSpecs(path);
    } else if (/\.spec\.ts$/.test(entry)) {
      yield path;
    }
  }
}

const issues = [];
let total = 0;

for (const file of walkSpecs(ROOT)) {
  total++;
  const rel = relative(process.cwd(), file);
  const text = readFileSync(file, "utf8");
  const lower = file.toLowerCase();
  const flags = [];

  const has = (re) => re.test(text);

  // Universal anti-patterns
  const interactive = [/page\.click\s*\(/, /page\.fill\s*\(/, /setInputFiles\s*\(/];
  if (!interactive.some(has)) {
    flags.push(
      "no page.click / page.fill / setInputFiles — spec does not interact with the UI"
    );
  }

  const dbCall = [
    /\.from\s*\(\s*['"`][^'"`]+['"`]\s*\)\s*\.select\s*\(/,
    /storage\.from\s*\(/,
  ];
  const expectsPage = /expect\s*\(\s*page\b/.test(text);

  if (!expectsPage) {
    flags.push("no expect(page.*) — UI state never asserted");
  }

  // "Only renders" anti-pattern: assertions are only isVisible /
  // not.toBeNull and there is no DB / storage assertion.
  const onlyVisible =
    /\.isVisible\s*\(/.test(text) ||
    /not\.toBeNull\s*\(/.test(text);
  const richExpect = /expect\([^)]*\)\.toHaveURL\b|toHaveText\b|toEqual\b|toContain\b/.test(
    text
  );
  if (onlyVisible && !richExpect && !dbCall.some(has)) {
    flags.push(
      "assertions limited to isVisible/not.toBeNull and no DB query — renders ≠ works"
    );
  }

  // Mock-only anti-pattern.
  const fetches = (text.match(/\bfetch\s*\(/g) || []).length;
  const mocks = (text.match(/page\.route\s*\(/g) || []).length;
  if (fetches > 0 && mocks > 0 && fetches === mocks) {
    flags.push(
      "every fetch in the spec is mocked via page.route — backend is never exercised"
    );
  }

  // Filename heuristics
  if (lower.includes("upload") && !/setInputFiles\s*\(/.test(text)) {
    flags.push(
      "spec is named *upload* but never calls setInputFiles — file path not actually exercised"
    );
  }

  // Category-specific checks
  if (lower.includes("upload")) {
    if (!/storage\.from\s*\(\s*['"`][^'"`]+['"`]\s*\)\s*\.list\s*\(/.test(text)) {
      flags.push(
        "upload spec does not query storage.from(...).list(...) — file landing not verified"
      );
    }
  } else if (
    lower.includes("auth") ||
    lower.includes("sign-in") ||
    lower.includes("sign-out") ||
    lower.includes("login")
  ) {
    if (!/page\.fill\s*\(\s*['"`]\[name=['"]?email/.test(text)) {
      flags.push("auth spec does not fill the email input");
    }
    if (!/cookie|\/api\/me|getSession|getUser/.test(text)) {
      flags.push("auth spec does not verify the session via cookie or /api/me");
    }
  } else if (
    /form|submit|create|update/.test(lower) &&
    !lower.includes("upload")
  ) {
    if (!/page\.click\s*\(/.test(text)) {
      flags.push("form/submit spec does not page.click() the submit control");
    }
    if (!dbCall.some(has)) {
      flags.push(
        "form/submit spec does not query the DB to verify the row was written"
      );
    }
  }

  if (flags.length > 0) {
    issues.push({ file: rel, flags });
  }
}

if (total === 0) {
  console.warn(
    "verify-test-realness: WARN — no spec files found under tests/e2e/. " +
      "Either no E2E tests exist yet, or the directory layout differs from the template."
  );
  process.exit(0);
}

if (issues.length === 0) {
  console.log(
    `verify-test-realness: OK — ${total} spec(s) scanned, no anti-patterns flagged.`
  );
  process.exit(0);
}

console.error(
  `verify-test-realness: FAIL — ${issues.length} of ${total} spec(s) flagged.\n`
);
for (const issue of issues) {
  console.error(`  ${issue.file}`);
  for (const f of issue.flags) {
    console.error(`    - ${f}`);
  }
}
console.error(
  "\nRewrite each flagged spec so it interacts with the real UI and verifies real backend state."
);
process.exit(1);
