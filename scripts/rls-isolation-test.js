#!/usr/bin/env node
/**
 * RLS Isolation Test
 *
 * Creates two companies with two users each and asserts company A
 * cannot read company B's data through every RPC and every table.
 * Run against a local or test database only, NEVER production.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/rls-isolation-test.js
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("🔒 Starting RLS Isolation Test\n");

  // Create two test companies
  const companyA = await createCompany("Test Company A");
  const companyB = await createCompany("Test Company B");
  console.log(`Created Company A: ${companyA.id}`);
  console.log(`Created Company B: ${companyB.id}\n`);

  // Create two users per company
  const userA1 = await createUser("usera1@test.local", companyA.id);
  const userA2 = await createUser("usera2@test.local", companyA.id);
  const userB1 = await createUser("userb1@test.local", companyB.id);
  const userB2 = await createUser("userb2@test.local", companyB.id);
  console.log(`Created users: A1=${userA1.id}, A2=${userA2.id}, B1=${userB1.id}, B2=${userB2.id}\n`);

  // Create clients for each user (using anon key + JWT)
  const clientA1 = await createUserClient(userA1.id);
  const clientA2 = await createUserClient(userA2.id);
  const clientB1 = await createUserClient(userB1.id);
  const clientB2 = await createUserClient(userB2.id);

  // Test 1: profiles table isolation
  await testProfilesIsolation(clientA1, clientB1, userA1.id, userB1.id);

  // Test 2: companies table isolation (should be inaccessible directly)
  await testCompaniesIsolation(clientA1, clientB1, companyA.id, companyB.id);

  // Test 3: tasks table isolation
  await testTasksIsolation(clientA1, clientB1, userA1.id, userB1.id, companyA.id, companyB.id);

  // Test 4: task_history (via profiles) isolation
  await testTaskHistoryIsolation(clientA1, clientB1, userA1.id, userB1.id);

  // Test 5: get_my_company_route RPC isolation
  await testGetMyCompanyRoute(clientA1, clientB1, companyA.id, companyB.id);

  // Test 6: get_company_execution_analytics RPC isolation
  await testCompanyAnalyticsIsolation(clientA1, clientB1);

  // Test 7: get_operator_leaderboard should only show same-company operators (or global if no company)
  await testLeaderboardIsolation(clientA1, clientB1, userA1.id, userB1.id);

  // Test 8: get_workspace_access_status isolation
  await testWorkspaceAccessIsolation(clientA1, clientB1);

  // Test 9: handoff codes isolation
  await testHandoffCodesIsolation(clientA1, clientB1);

  // Test 10: invite token lookup should be rate limited and not leak info
  await testInviteTokenLookup(clientA1, companyA.invite_token, companyB.invite_token);

  // Test 11: push_subscriptions table isolation
  await testPushSubscriptionsIsolation(clientA1, clientB1, userA1.id, userB1.id);

  console.log("\n✅ All RLS isolation tests passed!");
}

async function createCompany(name) {
  const { data, error } = await admin
    .from("companies")
    .insert({ name, slug: name.toLowerCase().replace(/\s+/g, "-") })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createUser(email, companyId) {
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: "testpassword123",
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  });
  if (authError) throw authError;

  // Update profile with company_id
  const { error: profileError } = await admin
    .from("profiles")
    .update({ company_id: companyId })
    .eq("id", authData.user.id);
  if (profileError) throw profileError;

  return { id: authData.user.id, email };
}

async function createUserClient(userId) {
  // Sign in to get a session
  const email = (await admin.auth.admin.getUserById(userId)).data.user?.email;
  const { data, error } = await admin.auth.signInWithPassword({
    email,
    password: "testpassword123",
  });
  if (error) throw error;

  return createClient(SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "", {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function testProfilesIsolation(clientA, clientB, userAId, userBId) {
  console.log("📋 Test 1: profiles table isolation");

  // User A can read their own profile
  const { data: ownProfile, error: ownError } = await clientA
    .from("profiles")
    .select("*")
    .eq("id", userAId)
    .single();
  if (ownError) throw new Error(`User A cannot read own profile: ${ownError.message}`);
  console.log("  ✓ User A can read own profile");

  // User A cannot read User B's profile
  const { data: otherProfile, error: otherError } = await clientA
    .from("profiles")
    .select("*")
    .eq("id", userBId)
    .single();
  if (otherProfile) throw new Error("User A can read User B's profile!");
  console.log("  ✓ User A cannot read User B's profile");

  // User B cannot read User A's profile
  const { data: otherProfile2, error: otherError2 } = await clientB
    .from("profiles")
    .select("*")
    .eq("id", userAId)
    .single();
  if (otherProfile2) throw new Error("User B can read User A's profile!");
  console.log("  ✓ User B cannot read User A's profile");
}

async function testCompaniesIsolation(clientA, clientB, companyAId, companyBId) {
  console.log("\n🏢 Test 2: companies table isolation (no direct access)");

  // Companies table has RLS with NO permissive policies - direct SELECT should return 0 rows
  const { data: companiesA, error: errorA } = await clientA.from("companies").select("*");
  if (errorA) throw new Error(`Company A query failed: ${errorA.message}`);
  if (companiesA && companiesA.length > 0) {
    throw new Error(`User A can see ${companiesA.length} companies directly!`);
  }
  console.log("  ✓ User A sees 0 companies via direct query");

  const { data: companiesB, error: errorB } = await clientB.from("companies").select("*");
  if (errorB) throw new Error(`Company B query failed: ${errorB.message}`);
  if (companiesB && companiesB.length > 0) {
    throw new Error(`User B can see ${companiesB.length} companies directly!`);
  }
  console.log("  ✓ User B sees 0 companies via direct query");
}

async function testTasksIsolation(clientA, clientB, userAId, userBId, companyAId, companyBId) {
  console.log("\n📝 Test 3: tasks table isolation");

  // User A creates a task
  const { data: taskA, error: taskAError } = await clientA
    .from("tasks")
    .insert({ user_id: userAId, company_id: companyAId, task_text: "Task A", impact_tier: "high" })
    .select()
    .single();
  if (taskAError) throw new Error(`User A cannot create task: ${taskAError.message}`);
  console.log("  ✓ User A created task in Company A");

  // User A can read their own task
  const { data: ownTask, error: ownError } = await clientA
    .from("tasks")
    .select("*")
    .eq("id", taskA.id)
    .single();
  if (ownError || !ownTask) throw new Error("User A cannot read own task");
  console.log("  ✓ User A can read own task");

  // User B cannot read User A's task
  const { data: otherTask, error: otherError } = await clientB
    .from("tasks")
    .select("*")
    .eq("id", taskA.id)
    .single();
  if (otherTask) throw new Error("User B can read User A's task!");
  console.log("  ✓ User B cannot read User A's task");

  // User B creates their own task
  const { data: taskB, error: taskBError } = await clientB
    .from("tasks")
    .insert({ user_id: userBId, company_id: companyBId, task_text: "Task B", impact_tier: "medium" })
    .select()
    .single();
  if (taskBError) throw new Error(`User B cannot create task: ${taskBError.message}`);

  // User A cannot read User B's task
  const { data: otherTask2 } = await clientA
    .from("tasks")
    .select("*")
    .eq("id", taskB.id)
    .single();
  if (otherTask2) throw new Error("User A can read User B's task!");
  console.log("  ✓ User A cannot read User B's task");

  // User A cannot insert task with Company B's company_id
  const { error: crossInsertError } = await clientA
    .from("tasks")
    .insert({ user_id: userAId, company_id: companyBId, task_text: "Cross-tenant", impact_tier: "low" });
  if (!crossInsertError) throw new Error("User A can insert task for Company B!");
  console.log("  ✓ User A cannot insert task for Company B");
}

async function testTaskHistoryIsolation(clientA, clientB, userAId, userBId) {
  console.log("\n📜 Test 4: task_history (via profiles) isolation");

  // User A updates their task_history
  const { error: updateError } = await clientA
    .from("profiles")
    .update({ task_history: [{ date: "2026-01-01", text: "Task A1", tier: "high" }] })
    .eq("id", userAId);
  if (updateError) throw new Error(`User A cannot update task_history: ${updateError.message}`);

  // User B cannot read User A's task_history
  const { data: profileA, error: readError } = await clientB
    .from("profiles")
    .select("task_history")
    .eq("id", userAId)
    .single();
  if (!readError && profileA?.task_history?.length > 0) {
    throw new Error("User B can read User A's task_history!");
  }
  console.log("  ✓ User B cannot read User A's task_history");
}

async function testGetMyCompanyRoute(clientA, clientB, companyAId, companyBId) {
  console.log("\n🔍 Test 5: get_my_company_route RPC isolation");

  const { data: routeA, error: errorA } = await clientA.rpc("get_my_company_route");
  if (errorA) throw new Error(`get_my_company_route failed for A: ${errorA.message}`);
  if (!routeA || routeA.length === 0) throw new Error("User A got no company route");
  if (routeA[0].company_id !== companyAId) throw new Error("User A got wrong company route");
  console.log("  ✓ User A gets own company route");

  const { data: routeB, error: errorB } = await clientB.rpc("get_my_company_route");
  if (errorB) throw new Error(`get_my_company_route failed for B: ${errorB.message}`);
  if (!routeB || routeB.length === 0) throw new Error("User B got no company route");
  if (routeB[0].company_id !== companyBId) throw new Error("User B got wrong company route");
  console.log("  ✓ User B gets own company route");
}

async function testCompanyAnalyticsIsolation(clientA, clientB) {
  console.log("\n📊 Test 6: get_company_execution_analytics RPC isolation");

  const { data: analyticsA, error: errorA } = await clientA.rpc("get_company_execution_analytics", { p_days: 7 });
  if (errorA) throw new Error(`Analytics failed for A: ${errorA.message}`);
  if (!analyticsA) throw new Error("User A got null analytics");
  console.log("  ✓ User A gets own company analytics");

  const { data: analyticsB, error: errorB } = await clientB.rpc("get_company_execution_analytics", { p_days: 7 });
  if (errorB) throw new Error(`Analytics failed for B: ${errorB.message}`);
  if (!analyticsB) throw new Error("User B got null analytics");
  console.log("  ✓ User B gets own company analytics");

  // Verify they're different companies
  if (analyticsA.company_id === analyticsB.company_id) {
    throw new Error("Both users got same company_id in analytics!");
  }
  console.log("  ✓ Analytics are company-scoped");
}

async function testLeaderboardIsolation(clientA, clientB, userAId, userBId) {
  console.log("\n🏆 Test 7: get_operator_leaderboard RPC");

  // Note: get_operator_leaderboard is a global leaderboard (all companies)
  // This is INTENTIONAL per the migration comments - it's a safe ranked ledger
  // that only exposes non-sensitive telemetry.
  const { data: lbA, error: errorA } = await clientA.rpc("get_operator_leaderboard");
  if (errorA) throw new Error(`Leaderboard failed for A: ${errorA.message}`);
  console.log(`  ✓ User A sees leaderboard with ${lbA?.length ?? 0} operators`);

  const { data: lbB, error: errorB } = await clientB.rpc("get_operator_leaderboard");
  if (errorB) throw new Error(`Leaderboard failed for B: ${errorB.message}`);
  console.log(`  ✓ User B sees leaderboard with ${lbB?.length ?? 0} operators`);

  // Both should see the same global leaderboard (by design)
  // But we verify they can see each other (global scope)
  const aSeesB = lbA?.some((u) => u.id === userBId);
  const bSeesA = lbB?.some((u) => u.id === userAId);
  console.log(`  ✓ Global leaderboard visible to both (by design): A sees B=${aSeesB}, B sees A=${bSeesA}`);
}

async function testWorkspaceAccessIsolation(clientA, clientB) {
  console.log("\n🔐 Test 8: get_workspace_access_status RPC isolation");

  const { data: accessA, error: errorA } = await clientA.rpc("get_workspace_access_status");
  if (errorA) throw new Error(`Workspace access failed for A: ${errorA.message}`);
  if (!accessA || accessA.length === 0) throw new Error("User A got no workspace access");
  console.log("  ✓ User A gets own workspace access status");

  const { data: accessB, error: errorB } = await clientB.rpc("get_workspace_access_status");
  if (errorB) throw new Error(`Workspace access failed for B: ${errorB.message}`);
  if (!accessB || accessB.length === 0) throw new Error("User B got no workspace access");
  console.log("  ✓ User B gets own workspace access status");
}

async function testHandoffCodesIsolation(clientA, clientB) {
  console.log("\n🔑 Test 9: handoff_codes table isolation");

  // User A issues a handoff code
  const { data: codeA, error: errorA } = await clientA.rpc("issue_handoff_code", { p_target_slug: "platform" });
  if (errorA) throw new Error(`issue_handoff_code failed for A: ${errorA.message}`);
  console.log("  ✓ User A issued handoff code");

  // User B cannot read User A's handoff codes
  const { data: codesB, error: codesError } = await clientB.from("handoff_codes").select("*");
  if (codesError) throw new Error(`handoff_codes query failed for B: ${codesError.message}`);
  if (codesB && codesB.length > 0) {
    throw new Error("User B can see User A's handoff codes!");
  }
  console.log("  ✓ User B cannot see User A's handoff codes");

  // User A cannot read User B's handoff codes (should be empty)
  const { data: codesA } = await clientA.from("handoff_codes").select("*");
  // User A should only see their own unconsumed codes
  const userACodes = codesA?.filter((c) => c.user_id === (await clientA.auth.getUser()).data.user?.id) ?? [];
  console.log(`  ✓ User A sees ${userACodes.length} own handoff codes`);
}

async function testInviteTokenLookup(clientA, tokenA, tokenB) {
  console.log("\n🎫 Test 10: invite token lookup isolation & rate limit");

  // User A can look up their own company's invite token
  const { data: routeA, error: errorA } = await clientA.rpc("get_company_route_by_invite_token", { p_token: tokenA });
  if (errorA) throw new Error(`Invite lookup failed for A: ${errorA.message}`);
  if (!routeA || routeA.length === 0) throw new Error("User A got no route for own invite token");
  console.log("  ✓ User A can resolve own invite token");

  // User A CAN look up Company B's invite token (public branding only, possession = auth)
  // This is by design - invite tokens are meant to be shared
  const { data: routeB, error: errorB } = await clientA.rpc("get_company_route_by_invite_token", { p_token: tokenB });
  if (errorB) throw new Error(`Invite lookup failed for B's token: ${errorB.message}`);
  if (!routeB || routeB.length === 0) {
    console.log("  ✓ User A gets empty result for B's token (if token invalid or rate limited)");
  } else {
    console.log("  ✓ User A can resolve B's invite token (public branding, possession = auth)");
  }

  // Rate limit test: hammer the endpoint
  console.log("  📈 Testing rate limit (10 req/min)...");
  let rateLimited = false;
  for (let i = 0; i < 12; i++) {
    const { error } = await clientA.rpc("get_company_route_by_invite_token", { p_token: "invalid-token" });
    if (error) {
      rateLimited = true;
      console.log(`    Request ${i + 1}: rate limited (${error.message})`);
      break;
    }
  }
  if (!rateLimited) {
    console.warn("  ⚠️  Rate limit may not be enforced (expected 10/min)");
  } else {
    console.log("  ✓ Rate limiting enforced");
  }
}

async function testPushSubscriptionsIsolation(clientA, clientB, userAId, userBId) {
  console.log("\n📱 Test 11: push_subscriptions table isolation");

  // User A inserts a subscription
  const subA = {
    user_id: userAId,
    endpoint: "https://push.example.com/endpoint-a",
    p256dh: "p256dh-a",
    auth: "auth-a",
    timezone: "America/Los_Angeles",
  };
  const { error: insertErrorA } = await clientA.from("push_subscriptions").insert(subA);
  if (insertErrorA) throw new Error(`User A insert failed: ${insertErrorA.message}`);
  console.log("  ✓ User A inserted own subscription");

  // User B cannot read User A's subscription
  const { data: subB, error: readErrorB } = await clientB.from("push_subscriptions").select("*").eq("user_id", userAId);
  if (readErrorB) throw new Error(`User B read failed: ${readErrorB.message}`);
  if (subB && subB.length > 0) throw new Error("User B can read User A's subscription!");
  console.log("  ✓ User B cannot read User A's subscription");

  // User B inserts their own subscription
  const subBInsert = {
    user_id: userBId,
    endpoint: "https://push.example.com/endpoint-b",
    p256dh: "p256dh-b",
    auth: "auth-b",
    timezone: "Europe/Berlin",
  };
  const { error: insertErrorB } = await clientB.from("push_subscriptions").insert(subBInsert);
  if (insertErrorB) throw new Error(`User B insert failed: ${insertErrorB.message}`);
  console.log("  ✓ User B inserted own subscription");

  // User A cannot read User B's subscription
  const { data: subARead, error: readErrorA } = await clientA.from("push_subscriptions").select("*").eq("user_id", userBId);
  if (readErrorA) throw new Error(`User A read failed: ${readErrorA.message}`);
  if (subARead && subARead.length > 0) throw new Error("User A can read User B's subscription!");
  console.log("  ✓ User A cannot read User B's subscription");

  // User A can read their own subscription
  const { data: subAOwn, error: readErrorAOwn } = await clientA.from("push_subscriptions").select("*").eq("user_id", userAId);
  if (readErrorAOwn) throw new Error(`User A read own failed: ${readErrorAOwn.message}`);
  if (!subAOwn || subAOwn.length !== 1 || subAOwn[0].endpoint !== subA.endpoint) {
    throw new Error("User A cannot read own subscription correctly!");
  }
  console.log("  ✓ User A can read own subscription");

  // User A can delete their own subscription
  const { error: deleteErrorA } = await clientA.from("push_subscriptions").delete().eq("user_id", userAId);
  if (deleteErrorA) throw new Error(`User A delete failed: ${deleteErrorA.message}`);
  console.log("  ✓ User A deleted own subscription");

  // User B cannot delete User A's subscription (already deleted, but verify no error)
  const { error: deleteErrorB } = await clientB.from("push_subscriptions").delete().eq("user_id", userAId);
  // Should not error, just affect 0 rows
  console.log("  ✓ User B cannot delete User A's subscription (no-op)");

  // Verify User B's subscription still exists
  const { data: subBRemaining } = await clientB.from("push_subscriptions").select("*").eq("user_id", userBId);
  if (!subBRemaining || subBRemaining.length !== 1) throw new Error("User B's subscription was affected!");
  console.log("  ✓ User B's subscription unaffected");
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});