#!/usr/bin/env node
// =============================================================================
// verify-cors-on-errors.mjs — every edge function must send CORS on ERROR paths
// =============================================================================
// Drift catcher. A common, hard-to-debug bug: edge functions add CORS headers on
// the success response but NOT on the 4xx/5xx returns, so the browser shows an
// opaque "CORS error" instead of the real status. This statically checks that
// each supabase/functions/<fn>/index.ts (a) handles the OPTIONS preflight and
// (b) routes errors through a sanitized error helper (safeError/corsHeaders),
// rather than returning bare `new Response(...)` on failure.
// =============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FN_DIR = "supabase/functions";
if (!existsSync(FN_DIR)) {
  console.log("✓ no edge functions to check");
  process.exit(0);
}

const findings = [];
for (const entry of readdirSync(FN_DIR)) {
  if (entry.startsWith("_")) continue; // _shared
  const idx = join(FN_DIR, entry, "index.ts");
  if (!existsSync(idx)) continue;
  const text = readFileSync(idx, "utf8");

  const handlesPreflight = /handlePreflight|OPTIONS|preflight/.test(text);
  const hasCorsHelper = /corsHeaders|safeError|withErrorHandler/.test(text);
  // Bare error responses with an explicit non-2xx status and no cors helper nearby.
  const bareError = /new Response\([^)]*status:\s*(4\d\d|5\d\d)/.test(text) && !hasCorsHelper;

  if (!handlesPreflight) findings.push(`${idx}  missing OPTIONS/preflight handling`);
  if (bareError) findings.push(`${idx}  returns a bare error Response without CORS/safeError`);
}

if (findings.length) {
  console.error(`✗ CORS-on-error problems (${findings.length}):\n  ` + findings.join("\n  "));
  process.exit(1);
}
console.log("✓ edge functions handle preflight + send CORS on error paths");
