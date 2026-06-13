#!/usr/bin/env node
// =============================================================================
// verify-test-coverage.mjs — every required surface has a test
// =============================================================================
// Drift catcher. `tests/coverage-manifest.json` lists the surfaces that MUST be
// tested (each table's cross-user isolation, each edge function's auth/validation,
// the golden-path UI flows). This checks every required entry has a matching test
// file/spec and is not marked done without one — so "tests pass" can't hide an
// untested security-critical surface.
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const MANIFEST = "tests/coverage-manifest.json";
if (!existsSync(MANIFEST)) {
  console.error(`✗ ${MANIFEST} missing — create it from coverage-manifest.template.json`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const required = Array.isArray(manifest.required) ? manifest.required : [];

function allText(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) allText(p, out);
    else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(p))) out.push(readFileSync(p, "utf8"));
  }
  return out;
}
const corpus = [...allText("tests"), ...allText("e2e")].join("\n").toLowerCase();

const missing = required.filter((entry) => {
  const needle = String(entry.match ?? entry.name ?? entry).toLowerCase();
  return needle && !corpus.includes(needle);
});

if (missing.length) {
  console.error(`✗ ${missing.length} required surface(s) have NO test:\n  ` +
    missing.map((m) => m.name ?? m.match ?? m).join("\n  "));
  process.exit(1);
}
console.log(`✓ all ${required.length} required surfaces in the coverage manifest have a test`);
