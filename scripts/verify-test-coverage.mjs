#!/usr/bin/env node
// scripts/verify-test-coverage.mjs
//
// Reads tests/coverage-manifest.json. Every entry maps a P0 user
// story to its expected spec file path. Verifies:
//
//   - Each spec file referenced in the manifest exists on disk.
//   - Each spec file contains at least one `test(` block whose name
//     references the story_id (e.g., test("US-001: ...", ...)).
//
// The manifest is the contract between PRD and tests. Phase 0 ships
// it with UM-1..UM-10 universal stories pre-filled; Phase 1 expands
// it as feature stories are implemented.
//
// Exits 0 on clean. Exits 1 with a table of misses on failure.

import { existsSync, readFileSync } from "node:fs";

const MANIFEST_PATH = "tests/coverage-manifest.json";

if (!existsSync(MANIFEST_PATH)) {
  console.error(
    `verify-test-coverage: FAIL — ${MANIFEST_PATH} not found.\n` +
      "Copy tests/coverage-manifest.template.json and fill in story IDs."
  );
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
} catch (err) {
  console.error(`verify-test-coverage: FAIL — cannot parse ${MANIFEST_PATH}:`);
  console.error(`  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

if (!Array.isArray(manifest.specs)) {
  console.error(
    `verify-test-coverage: FAIL — ${MANIFEST_PATH} is missing the "specs" array.`
  );
  process.exit(1);
}

const rows = [];
let missing = 0;

for (const spec of manifest.specs) {
  const { story_id, story_title, spec_file, required } = spec;
  const row = {
    story_id,
    story_title: story_title ?? "",
    spec_file: spec_file ?? "",
    status: "OK",
  };

  if (!spec_file) {
    row.status = "no spec_file declared";
    if (required !== false) missing++;
  } else if (!existsSync(spec_file)) {
    row.status = "FILE MISSING";
    if (required !== false) missing++;
  } else {
    const text = readFileSync(spec_file, "utf8");
    const re = new RegExp(
      `test\\s*\\(\\s*['"\`].*\\b${story_id}\\b`,
      "i"
    );
    if (!re.test(text)) {
      row.status = `no test() block referencing ${story_id}`;
      if (required !== false) missing++;
    }
  }

  rows.push(row);
}

const widths = {
  story: Math.max(8, ...rows.map((r) => r.story_id.length)),
  title: Math.min(40, Math.max(5, ...rows.map((r) => r.story_title.length))),
  file: Math.min(50, Math.max(9, ...rows.map((r) => r.spec_file.length))),
};

console.log(
  pad("Story", widths.story) +
    "  " +
    pad("Title", widths.title) +
    "  " +
    pad("Spec", widths.file) +
    "  Status"
);
console.log("-".repeat(widths.story + widths.title + widths.file + 14));
for (const r of rows) {
  console.log(
    pad(r.story_id, widths.story) +
      "  " +
      pad(truncate(r.story_title, widths.title), widths.title) +
      "  " +
      pad(truncate(r.spec_file, widths.file), widths.file) +
      "  " +
      r.status
  );
}

if (missing === 0) {
  console.log(
    `\nverify-test-coverage: OK — ${rows.length} spec(s) accounted for.`
  );
  process.exit(0);
}

console.error(
  `\nverify-test-coverage: FAIL — ${missing} required spec(s) missing or unreferenced.`
);
process.exit(1);

function pad(s, n) {
  s = String(s ?? "");
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function truncate(s, n) {
  s = String(s ?? "");
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + "…";
}
