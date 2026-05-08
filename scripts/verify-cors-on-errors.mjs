#!/usr/bin/env node
// scripts/verify-cors-on-errors.mjs
//
// Backstop for the Security-Repo helper discipline. `safeError` /
// `requireAuth` / etc. all attach corsHeaders(req) to every Response
// they build. This script catches the case where someone bypasses
// the helpers — building an inline `new Response(... status: 4xx|5xx
// ...)` directly inside an edge function.
//
// Scope is narrow on purpose:
//
//   - Scans:    supabase/functions/**/*.ts
//   - Excludes: supabase/functions/_shared/**  (helpers live there)
//   - Matches:  new Response(...) with a literal `status: 4|5xx` value
//   - Skips:    dynamic statuses (status: getStatus())
//   - Flags:    matched responses missing corsHeaders(req) in the
//               headers literal
//
// Exits 0 on clean. Exits 1 with a list of violations on failure.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "supabase/functions";
const EXCLUDE_DIR = "_shared";

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
      if (entry === EXCLUDE_DIR) continue;
      yield* walk(path);
    } else if (/\.ts$/.test(entry)) {
      yield path;
    }
  }
}

const violations = [];

for (const file of walk(ROOT)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  // Match `new Response(...)` constructions. Use a non-greedy scan
  // anchored on `new Response(`. Capture up to the matching closing
  // paren via a simple paren-depth walker.
  const re = /new\s+Response\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    let depth = 0;
    let i = m.index + m[0].length - 1;
    let end = -1;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    const construct = text.slice(start, end + 1);

    // Look for a literal status: 4xx / 5xx. Skip dynamic statuses.
    const statusMatch = /status\s*:\s*(\d{3})\b/.exec(construct);
    if (!statusMatch) continue;
    const status = Number(statusMatch[1]);
    if (status < 400 || status >= 600) continue;

    // Already includes corsHeaders? Fine.
    if (/corsHeaders\s*\(/.test(construct)) continue;

    // Compute the line number of `start`.
    const before = text.slice(0, start);
    const line = before.split(/\r?\n/).length;

    violations.push({
      file: relative(process.cwd(), file),
      line,
      status,
      snippet: construct.replace(/\s+/g, " ").slice(0, 140),
    });
  }
}

if (violations.length === 0) {
  console.log(
    "verify-cors-on-errors: OK — every inline 4xx/5xx Response in supabase/functions/ attaches corsHeaders"
  );
  process.exit(0);
}

console.error(
  `verify-cors-on-errors: FAIL — ${violations.length} response(s) missing corsHeaders`
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  (status ${v.status})`);
  console.error(`    ${v.snippet}`);
}
console.error(
  "\nEither route through safeError(req, status, message) from _shared/error-handler.ts,\n" +
    "or attach ...corsHeaders(req) to the inline Response's headers."
);
process.exit(1);
