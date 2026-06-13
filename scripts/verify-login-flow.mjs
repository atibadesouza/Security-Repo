#!/usr/bin/env node
// =============================================================================
// verify-login-flow.mjs — empirically prove auth actually works
// =============================================================================
// Drift catcher. Instead of trusting that login "should" work, this signs in as
// the seeded test user with the ANON client (exactly what a real browser does),
// asserts a session + JWT come back, confirms the JWT resolves to a user, and
// checks that a BAD password is rejected. Run after every auth-touching change.
// Needs TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD in .env.test.
// =============================================================================

import { anonClient, ENV } from "./_supabase-node-client.mjs";

const email = ENV.TEST_USER_A_EMAIL;
const password = ENV.TEST_USER_A_PASSWORD;

if (!email || !password) {
  console.error("✗ TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD not set in .env.test");
  process.exit(1);
}

const supabase = anonClient();

// 1. Correct credentials → a real session.
const { data: ok, error: okErr } = await supabase.auth.signInWithPassword({ email, password });
if (okErr || !ok?.session?.access_token) {
  console.error(`✗ login failed for the seeded test user: ${okErr?.message ?? "no session returned"}`);
  process.exit(1);
}

// 2. The JWT resolves to that user.
const { data: who, error: whoErr } = await supabase.auth.getUser(ok.session.access_token);
if (whoErr || who?.user?.email?.toLowerCase() !== email.toLowerCase()) {
  console.error(`✗ JWT did not resolve to ${email}: ${whoErr?.message ?? who?.user?.email}`);
  process.exit(1);
}

// 3. Wrong password is rejected.
await supabase.auth.signOut();
const { data: bad } = await supabase.auth.signInWithPassword({ email, password: password + "_WRONG" });
if (bad?.session) {
  console.error("✗ SECURITY: login succeeded with a wrong password");
  process.exit(1);
}

await supabase.auth.signOut();
console.log(`✓ login flow works: ${email} authenticates, JWT resolves, wrong password rejected`);
