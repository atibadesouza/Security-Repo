#!/usr/bin/env node
// scripts/verify-layer-boundaries.mjs
//
// Greppable enforcement of CLAUDE.md Rule 21: Presentation layer
// (`src/app/**`, `src/components/**`) MUST NOT import any Supabase
// client. Type-only imports (`import type ...`) are allowed.
//
// Exits 0 on clean. Exits 1 with a list of violations on failure.
// Run as part of every Phase 1 completion check.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/app", "src/components"];
const FORBIDDEN_SUBSTRINGS = [
  "@/lib/supabaseClient",
  "@/lib/supabase/",
  "@supabase/supabase-js",
  "@supabase/ssr",
];

function* walk(dir) {
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
      yield* walk(path);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      yield path;
    }
  }
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      // Skip type-only imports — they don't pull in runtime code.
      if (/^import\s+type\b/.test(trimmed)) return;
      // Only flag actual import / require lines.
      if (!/^(import\b|const\s+\w+\s*=\s*require\b)/.test(trimmed)) return;

      for (const substr of FORBIDDEN_SUBSTRINGS) {
        if (line.includes(substr)) {
          violations.push({
            file: relative(process.cwd(), file),
            line: idx + 1,
            text: line.trim(),
            matched: substr,
          });
          break;
        }
      }
    });
  }
}

if (violations.length === 0) {
  console.log("verify-layer-boundaries: OK — no Supabase imports in app/ or components/");
  process.exit(0);
}

console.error(
  `verify-layer-boundaries: FAIL — ${violations.length} forbidden import(s)`
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  (matches "${v.matched}")`);
  console.error(`    ${v.text}`);
}
console.error(
  "\nMove the Supabase calls into src/lib/services/* and re-import via the service layer."
);
process.exit(1);
