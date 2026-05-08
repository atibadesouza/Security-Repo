#!/usr/bin/env node
// scripts/verify-login-flow.mjs
//
// Wrapper around `npx playwright test tests/e2e/auth/*.spec.ts`. The
// actual flow assertions live in Playwright specs that the bundle
// ships under tests/e2e/auth/. This wrapper:
//
//   1. Confirms .env.test exists and has TEST_USER_A_* credentials.
//   2. Confirms the dev server is running (reads .next/dev-port if
//      present, otherwise checks $PORT or 3000).
//   3. Runs the auth spec subset.
//   4. Exits with the test runner's exit code.
//
// The Phase 0 plan file calls this BEFORE any feature work. If it
// fails, fix the auth scaffolding before continuing.

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const ENV_TEST = ".env.test";
const DEV_PORT_FILE = ".next/dev-port";

if (!existsSync(ENV_TEST)) {
  console.error(
    `verify-login-flow: FAIL — ${ENV_TEST} not found.\n` +
      "Run `cp .env.test.example .env.test` and fill in TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD."
  );
  process.exit(1);
}
const envTestText = readFileSync(ENV_TEST, "utf8");
for (const k of ["TEST_USER_A_EMAIL", "TEST_USER_A_PASSWORD"]) {
  const re = new RegExp(`^${k}\\s*=\\s*\\S+`, "m");
  if (!re.test(envTestText)) {
    console.error(
      `verify-login-flow: FAIL — ${k} is unset in ${ENV_TEST}. Fill it in before running.`
    );
    process.exit(1);
  }
}

let port = process.env.PORT;
if (!port && existsSync(DEV_PORT_FILE)) {
  port = readFileSync(DEV_PORT_FILE, "utf8").trim();
}
port = port || "3000";

const baseURL = `http://localhost:${port}`;
console.log(`verify-login-flow: targeting ${baseURL}`);

// Quick health check — confirm the server is reachable before
// spending Playwright startup cost.
try {
  const res = await fetch(baseURL, { method: "HEAD" }).catch(() => null);
  if (!res) {
    console.error(
      `verify-login-flow: FAIL — dev server is not running at ${baseURL}.\n` +
        "Start it with `npm run dev` in another terminal first."
    );
    process.exit(1);
  }
} catch {
  // Older Node without fetch — let Playwright surface the error.
}

const child = spawn(
  "npx",
  ["playwright", "test", "tests/e2e/auth/", "--reporter=list"],
  {
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseURL },
    shell: process.platform === "win32",
  }
);
child.on("exit", (code) => process.exit(code ?? 0));
