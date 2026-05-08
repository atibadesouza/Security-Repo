// scripts/start-dev.mjs
// Drop-in replacement for `next dev`. Reads PORT from .env.local;
// checks availability; on collision picks the next free port and
// passes it directly via `-p`. Does NOT mutate .env.local — the
// CORS allowlist covers 3000-3010 so persistence isn't required.

import { spawnSync, spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });

const requestedPort = Number(process.env.PORT ?? 3000);

function isPortFree(p) {
  const isWin = process.platform === "win32";
  const result = isWin
    ? spawnSync("netstat", ["-ano"], { encoding: "utf8" })
    : spawnSync("lsof", ["-i", `:${p}`], { encoding: "utf8" });
  if (result.error) {
    // Tool missing (Linux without lsof, etc.) — assume free.
    return true;
  }
  const occupied = isWin
    ? result.stdout.includes(`:${p} `) || result.stdout.includes(`:${p}\t`)
    : result.stdout.trim().length > 0;
  return !occupied;
}

function findFreePort(start, max = 10) {
  for (let i = 0; i < max; i++) {
    if (isPortFree(start + i)) return start + i;
  }
  throw new Error(`No free port in range ${start}-${start + max - 1}.`);
}

let port = requestedPort;
if (!isPortFree(port)) {
  console.warn(`Port ${port} is occupied. Selecting next free port...`);
  port = findFreePort(port + 1);
  console.warn(
    `Using port ${port}. (Not persisted — set PORT in .env.local if you want it sticky.)`
  );
}

// Optional crumb for tooling that wants to know the running port.
// Kept under .next/ so it's gitignored and tool-managed.
try {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(".next", { recursive: true });
  writeFileSync(".next/dev-port", String(port));
} catch {
  // .next not writable yet — first run will create it.
}

console.log(`> Starting dev server on http://localhost:${port}`);
const child = spawn("npx", ["next", "dev", "-p", String(port)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
