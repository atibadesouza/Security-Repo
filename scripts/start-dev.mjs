#!/usr/bin/env node
// =============================================================================
// start-dev.mjs — preflight, then start the dev server
// =============================================================================
// Wraps `next dev` with a fast preflight so the build doesn't start in a broken
// state: confirms the required env vars exist and that the .env files are
// gitignored (a leaked .env.local with a service_role key is catastrophic).
// Wire it as: "dev": "node scripts/start-dev.mjs"  in package.json.
// =============================================================================

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnv } from "./_supabase-node-client.mjs";

const env = loadEnv([".env.local"]);
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error(`✗ missing env vars in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

// Secrets must never be committable.
for (const f of [".env.local", ".env.test"]) {
  if (!existsSync(f)) continue;
  try {
    execSync(`git check-ignore ${f}`, { stdio: "ignore" });
  } catch {
    console.error(`✗ SECURITY: ${f} is NOT gitignored — add it to .gitignore before running.`);
    process.exit(1);
  }
}

// service_role must NOT be a public (NEXT_PUBLIC_) var.
if (Object.keys(env).some((k) => k.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE/.test(k))) {
  console.error("✗ SECURITY: a SERVICE_ROLE key is exposed under a NEXT_PUBLIC_ prefix.");
  process.exit(1);
}

console.log("✓ preflight passed — starting next dev");
const child = spawn("npx", ["next", "dev"], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
