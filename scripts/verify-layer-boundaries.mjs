#!/usr/bin/env node
// =============================================================================
// verify-layer-boundaries.mjs — enforce the 3-layer architecture statically
// =============================================================================
// Drift catcher (run at every checkpoint). The architecture forbids the
// Presentation layer (src/app, src/components) from touching the database
// directly or calling third-party APIs — all DB access goes through the Service
// layer, all external calls through edge functions. This greps for the
// violations and exits 1 if any are found.
// =============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const PRESENTATION = ["src/app", "src/components"];
const VIOLATIONS = [
  { re: /from\s+["'][^"']*supabaseClient["']|createClient\s*\(/, msg: "direct Supabase client import/creation" },
  { re: /\.from\s*\(\s*["'`]/, msg: "direct supabase.from(...) DB query" },
  { re: /service_role|SERVICE_ROLE_KEY/, msg: "service_role reference in client code" },
  { re: /fetch\s*\(\s*["'`]https?:\/\/(?!.*supabase)/, msg: "direct third-party HTTP call (use an edge function)" },
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(p))) out.push(p);
  }
  return out;
}

const findings = [];
for (const root of PRESENTATION) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    // Allow the dedicated client-factory folder to import the client.
    if (file.replace(/\\/g, "/").includes("src/lib/")) continue;
    text.split("\n").forEach((line, i) => {
      if (line.trim().startsWith("//")) return;
      for (const v of VIOLATIONS) {
        if (v.re.test(line)) findings.push(`${file}:${i + 1}  ${v.msg}\n    ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

if (findings.length) {
  console.error(`✗ layer-boundary violations (${findings.length}):\n` + findings.join("\n"));
  process.exit(1);
}
console.log("✓ layer boundaries clean — no direct DB / third-party calls in app/ or components/");
