// =============================================================================
// ABUSE TEST SCRIPT — Cross-user access, auth bypass, rate limiting
// =============================================================================
// Run this on every PR against a scratch Supabase instance.
// It creates two test users and verifies that security boundaries hold.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-net --allow-env tests/abuse-test.ts
//
// NOTE: The service_role key is used ONLY in this test script to set up
// test fixtures (create users, seed data). It is never used in app code.
//
// ADAPT: Replace "items" with your actual table names and add tests for
//        your specific Edge Functions and storage buckets.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertEquals,
  assertNotEquals,
  assert,
} from "https://deno.land/std@0.220.0/assert/mod.ts";

// ---------- Setup ----------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Admin client for test setup only
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Test user credentials
const USER_A = { email: "test-user-a@example.com", password: "TestPassword123!" };
const USER_B = { email: "test-user-b@example.com", password: "TestPassword456!" };

interface TestUser {
  id: string;
  token: string;
  client: ReturnType<typeof createClient>;
}

async function setupUser(creds: { email: string; password: string }): Promise<TestUser> {
  // Create user via admin
  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email: creds.email,
    password: creds.password,
    email_confirm: true,
  });
  if (createError && !createError.message.includes("already been registered")) {
    throw new Error(`Failed to create user: ${createError.message}`);
  }

  // Sign in to get JWT
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signIn, error: signInError } = await anonClient.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (signInError) throw new Error(`Failed to sign in: ${signInError.message}`);

  const token = signIn.session!.access_token;
  const userId = signIn.user!.id;

  // Create a client scoped to this user
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { id: userId, token, client };
}

async function cleanup() {
  // Clean up test users and their data
  for (const email of [USER_A.email, USER_B.email]) {
    const { data } = await admin.auth.admin.listUsers();
    const user = data?.users?.find((u) => u.email === email);
    if (user) {
      await admin.from("items").delete().eq("user_id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  }
}

// ---------- Tests ----------

let userA: TestUser;
let userB: TestUser;

Deno.test({
  name: "Setup: Create test users",
  fn: async () => {
    await cleanup();
    userA = await setupUser(USER_A);
    userB = await setupUser(USER_B);
    assertNotEquals(userA.id, userB.id);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- RLS Tests ---

Deno.test({
  name: "RLS: User A cannot read User B's rows",
  fn: async () => {
    // User B creates an item
    const { data: inserted } = await userB.client
      .from("items")
      .insert({ name: "User B's secret item" })
      .select()
      .single();
    assert(inserted, "User B should be able to insert");

    // User A tries to read it
    const { data: read } = await userA.client
      .from("items")
      .select("*")
      .eq("id", inserted.id);

    assertEquals(read?.length ?? 0, 0, "User A should NOT see User B's item");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "RLS: User A cannot update User B's rows",
  fn: async () => {
    // Get User B's items
    const { data: bItems } = await userB.client.from("items").select("id").limit(1);
    assert(bItems && bItems.length > 0, "User B should have items");

    // User A tries to update
    const { error } = await userA.client
      .from("items")
      .update({ name: "Hacked by A" })
      .eq("id", bItems[0].id);

    // The update should silently affect 0 rows (RLS filters it out)
    const { data: check } = await userB.client
      .from("items")
      .select("name")
      .eq("id", bItems[0].id)
      .single();

    assertNotEquals(check?.name, "Hacked by A", "User A should NOT modify User B's item");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "RLS: User A cannot delete User B's rows",
  fn: async () => {
    const { data: bItems } = await userB.client.from("items").select("id").limit(1);
    assert(bItems && bItems.length > 0, "User B should have items");

    // User A tries to delete
    await userA.client.from("items").delete().eq("id", bItems[0].id);

    // Verify still exists
    const { data: check } = await userB.client
      .from("items")
      .select("id")
      .eq("id", bItems[0].id);

    assertEquals(check?.length, 1, "User B's item should NOT be deleted by User A");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "RLS: User A cannot insert rows as User B",
  fn: async () => {
    // User A tries to insert a row with User B's user_id
    const { error } = await userA.client
      .from("items")
      .insert({ name: "Spoofed item", user_id: userB.id });

    // Should fail due to WITH CHECK policy
    assert(
      error !== null,
      "Inserting with another user's ID should be rejected by RLS policy"
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Auth Tests ---

Deno.test({
  name: "Auth: Edge function rejects request without JWT",
  fn: async () => {
    // ADAPT: Replace "create-item" with your actual function name
    const response = await fetch(`${FUNCTIONS_URL}/create-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should fail" }),
    });

    assertEquals(response.status, 401, "Should return 401 without JWT");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Auth: Edge function rejects invalid JWT",
  fn: async () => {
    const response = await fetch(`${FUNCTIONS_URL}/create-item`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid.jwt.token",
      },
      body: JSON.stringify({ name: "Should fail" }),
    });

    assertEquals(response.status, 401, "Should return 401 with invalid JWT");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Input Validation Tests ---

Deno.test({
  name: "Validation: Edge function rejects malformed input",
  fn: async () => {
    const response = await fetch(`${FUNCTIONS_URL}/create-item`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({
        // Missing required "name" field, invalid status
        status: "invalid_status",
      }),
    });

    assertEquals(response.status, 400, "Should return 400 for invalid input");
    const body = await response.json();
    assert(body.error, "Should include error message");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Rate Limit Tests ---

Deno.test({
  name: "Rate limit: Triggers after excessive requests",
  fn: async () => {
    // Send many rapid requests
    // ADAPT: Adjust the count to match your rate limit config
    const promises = [];
    for (let i = 0; i < 35; i++) {
      promises.push(
        fetch(`${FUNCTIONS_URL}/create-item`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userA.token}`,
          },
          body: JSON.stringify({ name: `Rate limit test ${i}` }),
        })
      );
    }

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);

    assert(
      statuses.includes(429),
      "Should get at least one 429 after exceeding rate limit"
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Cleanup ---

Deno.test({
  name: "Cleanup: Remove test users and data",
  fn: async () => {
    await cleanup();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
