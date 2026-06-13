#!/usr/bin/env node
// =============================================================================
// verify-test-realness.mjs — catch fake / always-pass tests
// =============================================================================
// Drift catcher. Agents under pressure sometimes "make the tests pass" by
// writing tests that can't fail — no assertions, `expect(true).toBe(true)`,
// everything skipped, or a try/catch that swallows failures. This scans the
// test files and flags those anti-patterns so green doesn't mean nothing.
// =============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const TEST_DIRS = ["tests", "e2e", "src"];
const TEST_FILE = /\.(test|spec)\.[tj]sx?$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEST_FILE.test(p) && [".ts", ".tsx", ".js", ".jsx"].includes(extname(p))) out.push(p);
  }
  return out;
}

const findings = [];
let testFiles = 0;
for (const d of TEST_DIRS) {
  for (const file of walk(d)) {
    testFiles++;
    const text = readFileSync(file, "utf8");
    const hasAssert = /\bexpect\s*\(|\bassert(\.|\s*\()|toBe|toEqual|toMatch|toThrow|\.ok\(/.test(text);
    const tautology = /expect\(\s*true\s*\)\s*\.toBe\(\s*true\s*\)|assert\(\s*true\s*\)/.test(text);
    const allSkipped =
      /\b(it|test|describe)\.skip\b/.test(text) &&
      !/\b(it|test)\s*\(/.test(text.replace(/\b(it|test|describe)\.skip\b/g, ""));

    if (!hasAssert) findings.push(`${file}  no assertions found`);
    if (tautology) findings.push(`${file}  tautological assertion (expect(true).toBe(true))`);
    if (allSkipped) findings.push(`${file}  every test is .skip`);
  }
}

if (testFiles === 0) {
  console.error("✗ no test files found at all — coverage cannot be real");
  process.exit(1);
}
if (findings.length) {
  console.error(`✗ fake-test smells (${findings.length}):\n  ` + findings.join("\n  "));
  process.exit(1);
}
console.log(`✓ ${testFiles} test files have real assertions (no tautologies / all-skipped)`);
