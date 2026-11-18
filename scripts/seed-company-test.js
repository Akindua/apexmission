#!/usr/bin/env node
/**
 * Dev-only seed script: creates a test company and two test users in a TEST
 * database. NOT a migration — never run against production.
 *
 * Usage (against a local or preview/test database):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/seed-company-test.js
 *
 * Creates:
 *   - one test company ("Acme Test Co", slug `acme-test-co`)
 *   - two employees in that company (alice@acme-test.local, bob@acme-test.local)
 *
 * Prints the company slug and user IDs so you can log in as either employee
 * and verify the company workspace loads at the company subdomain.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Refuse obvious production hostnames as a small guardrail.
const PRODUCTION_HOSTS = ["apexmissions.app", "www.apexmissions.app"];
const hostname = new URL(SUPABASE_URL).hostname;
if (PRODUCTION_HOSTS.includes(hostname)) {
  console.error(`Refusing to seed production host ${hostname}. Use a test database.`);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("🌱 Seeding test company (TEST database only)");

  const companyName = "Acme Test Co";
  const slug = "acme-test-co";

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name: companyName, slug })
    .select()
    .single();
  if (companyError) {
    // Idempotent: if the company already exists, fetch it.
    const { data: existing, error: fetchError } = await admin
      .from("companies")
      .select("*")
      .eq("slug", slug)
      .single();
    if (fetchError) throw companyError;
    console.log(`Company already exists: ${existing.id} (${existing.name})`);
    return { company: existing };
  }
  console.log(`Created company: ${company.id} (${company.name}, slug ${slug})`);

  const employees = [
    { email: "alice@acme-test.local", name: "Alice" },
    { email: "bob@acme-test.local", name: "Bob" },
  ];

  for (const { email, name } of employees) {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (authError) {
      // User may already exist; fetch by email.
      const { data: existing } = await admin.auth.admin.listUsers();
      const found = existing.users.find((u) => u.email === email);
      if (!found) throw authError;
      const { error: profileError } = await admin
        .from("profiles")
        .update({ company_id: company.id })
        .eq("id", found.id);
      if (profileError) throw profileError;
      console.log(`Employee already exists: ${email} (${found.id})`);
      continue;
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ company_id: company.id })
      .eq("id", authData.user.id);
    if (profileError) throw profileError;

    console.log(`Created employee: ${email} (${authData.user.id})`);
  }

  console.log("\n✅ Seed complete.");
  console.log(`   Company slug: ${slug}`);
  console.log(`   Employees: alice@acme-test.local, bob@acme-test.local (password: testpassword123)`);
  console.log(`   Log in at the company subdomain: http://${slug}.localhost:3000/app`);
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
