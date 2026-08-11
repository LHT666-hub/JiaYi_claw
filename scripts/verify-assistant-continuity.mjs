import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !url ||
  !anonKey ||
  !serviceRoleKey ||
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)
) {
  throw new Error("verify:assistant-continuity only runs against local Supabase.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
const password = `Local-${randomBytes(12).toString("hex")}!`;
const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const createdUserIds = [];
let assertions = 0;

async function createAccount(label, role, organizationId, communityId) {
  const email = `verify-assistant-${label}-${suffix}@example.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${label}.`);
  createdUserIds.push(data.user.id);
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: `Assistant ${label}`,
      role,
      organization_id: organizationId,
      community_id: communityId,
      account_status: "active",
    })
    .eq("id", data.user.id);
  if (profileError) throw profileError;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function record(client, residentId, traceId) {
  return client.rpc("record_assistant_activity", {
    p_resident_id: residentId,
    p_activity_type: "service_draft_prepared",
    p_service_type: "clinic_registration",
    p_risk_level: "low",
    p_source: "agent",
    p_skill_ids: ["service-intent-extractor"],
    p_knowledge_refs: [],
    p_action_kinds: ["service"],
    p_trace_id: traceId,
    p_channel: "wechat",
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
  assertions += 1;
}

try {
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "fengxian-primary-care")
    .single();
  if (organizationError) throw organizationError;
  const { data: community, error: communityError } = await admin
    .from("communities")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("slug", "haiwan-town")
    .single();
  if (communityError) throw communityError;

  const residentA = await createAccount(
    "resident-a",
    "resident",
    organization.id,
    community.id,
  );
  const residentB = await createAccount(
    "resident-b",
    "resident",
    organization.id,
    community.id,
  );
  const family = await createAccount(
    "family",
    "family",
    organization.id,
    community.id,
  );
  const unrelatedFamily = await createAccount(
    "unrelated-family",
    "family",
    organization.id,
    community.id,
  );
  const staff = await createAccount(
    "staff",
    "doctor",
    organization.id,
    community.id,
  );

  const { error: bindingError } = await admin.from("family_bindings").insert({
    resident_id: residentA.id,
    family_id: family.id,
    relationship: "女儿",
    status: "active",
  });
  if (bindingError) throw bindingError;

  const residentRecord = await record(
    residentA.client,
    residentA.id,
    `resident-${suffix}`,
  );
  expect(!residentRecord.error, `Resident record failed: ${residentRecord.error?.message}`);
  expect(Boolean(residentRecord.data?.sessionId), "Resident session id missing.");

  const familyRecord = await record(
    family.client,
    residentA.id,
    `family-${suffix}`,
  );
  expect(!familyRecord.error, `Authorized family record failed: ${familyRecord.error?.message}`);
  expect(
    familyRecord.data?.sessionId !== residentRecord.data?.sessionId,
    "Resident and family must not share private assistant sessions.",
  );

  const unrelatedRecord = await record(
    unrelatedFamily.client,
    residentA.id,
    `unrelated-${suffix}`,
  );
  expect(Boolean(unrelatedRecord.error), "Unrelated family activity was not blocked.");

  const staffRecord = await record(staff.client, residentA.id, `staff-${suffix}`);
  expect(Boolean(staffRecord.error), "Staff fabricated a resident assistant activity.");

  const { data: residentSessions, error: residentSessionsError } =
    await residentA.client.from("assistant_sessions").select("*");
  if (residentSessionsError) throw residentSessionsError;
  expect(residentSessions.length === 1, "Resident should see exactly their own session.");
  expect(
    residentSessions[0].created_by === residentA.id,
    "Resident saw a family member's private assistant session.",
  );

  const { data: foreignSessions, error: foreignSessionsError } =
    await residentB.client.from("assistant_sessions").select("id");
  if (foreignSessionsError) throw foreignSessionsError;
  expect(foreignSessions.length === 0, "Another resident saw assistant continuity data.");

  const { data: storedActivity, error: storedActivityError } = await admin
    .from("assistant_activities")
    .select("*")
    .eq("id", residentRecord.data.activityId)
    .single();
  if (storedActivityError) throw storedActivityError;
  const keys = Object.keys(storedActivity);
  for (const forbidden of ["question", "prompt", "answer", "content", "transcript"]) {
    expect(!keys.includes(forbidden), `Sensitive transcript column found: ${forbidden}.`);
  }
  expect(
    JSON.stringify(storedActivity).includes("service_draft_prepared"),
    "Structured activity category was not stored.",
  );

  const clearResult = await residentA.client.rpc("clear_assistant_session", {
    p_resident_id: residentA.id,
  });
  expect(!clearResult.error && clearResult.data === true, "Resident could not clear session.");
  const { count: remainingActivities, error: remainingError } = await admin
    .from("assistant_activities")
    .select("id", { count: "exact", head: true })
    .eq("session_id", residentRecord.data.sessionId);
  if (remainingError) throw remainingError;
  expect(remainingActivities === 0, "Clearing a session did not cascade to activities.");

  console.log(
    `Verified ${assertions} assistant continuity assertions: actor isolation, family authorization, staff denial, transcript minimization, and cascade clearing.`,
  );
} finally {
  for (const id of createdUserIds.reverse()) {
    await admin.auth.admin.deleteUser(id);
  }
}
