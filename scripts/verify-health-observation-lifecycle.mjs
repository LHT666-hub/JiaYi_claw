import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error("verify:health-observations only runs against the local Supabase stack.");
}
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Health-${randomBytes(12).toString("hex")}!`;
const userIds = [];
const observationIds = [];
let bindingId = null;
let assertions = 0;

async function createAccount(label, role, organizationId, communityId) {
  const email = `verify-health-${label}-${suffix}@example.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${label}.`);
  userIds.push(data.user.id);
  const { error: profileError } = await admin.from("profiles").update({
    display_name: `健康验证 ${label}`,
    role,
    organization_id: organizationId,
    community_id: communityId,
    account_status: "active",
    onboarding_completed_at: new Date().toISOString(),
  }).eq("id", data.user.id);
  if (profileError) throw profileError;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function createObservation(residentId, recordedBy, source = "manual") {
  const { data, error } = await admin.from("health_observations").insert({
    resident_id: residentId,
    recorded_by: recordedBy,
    observation_type: "weight",
    value: 66,
    secondary_value: null,
    unit: "kg",
    measured_at: new Date(Date.now() - 60_000).toISOString(),
    source,
  }).select("id").single();
  if (error || !data) throw error ?? new Error("Unable to create health observation.");
  observationIds.push(data.id);
  return data.id;
}

async function expectRpcError(client, id, marker, label) {
  const { error } = await client.rpc("delete_manual_health_observation", { p_observation_id: id });
  if (!error?.message.includes(marker)) {
    throw new Error(`${label}: expected ${marker}, received ${error?.message ?? "success"}.`);
  }
  assertions += 1;
}

async function expectDeleted(client, id, label) {
  const { data, error } = await client.rpc("delete_manual_health_observation", { p_observation_id: id });
  if (error || data !== true) throw error ?? new Error(`${label}: deletion did not return true.`);
  const { data: remaining, error: readError } = await admin.from("health_observations").select("id").eq("id", id).maybeSingle();
  if (readError || remaining) throw readError ?? new Error(`${label}: observation still exists.`);
  assertions += 1;
}

try {
  const { data: community, error: communityError } = await admin
    .from("communities")
    .select("id,organization_id")
    .eq("slug", "haiwan-town")
    .single();
  if (communityError) throw communityError;

  const resident = await createAccount("resident", "resident", community.organization_id, community.id);
  const family = await createAccount("family", "family", community.organization_id, community.id);
  const unrelated = await createAccount("unrelated", "resident", community.organization_id, community.id);

  const { data: binding, error: bindingError } = await admin.from("family_bindings").insert({
    resident_id: resident.id,
    family_id: family.id,
    relationship: "家属",
    status: "active",
  }).select("id").single();
  if (bindingError || !binding) throw bindingError ?? new Error("Unable to create family binding.");
  bindingId = binding.id;

  const residentManual = await createObservation(resident.id, resident.id);
  await expectRpcError(unrelated.client, residentManual, "FORBIDDEN", "unrelated resident deletion");
  await expectDeleted(resident.client, residentManual, "resident manual deletion");

  const imported = await createObservation(resident.id, resident.id, "confirmed_import");
  await expectRpcError(resident.client, imported, "IMMUTABLE", "imported observation deletion");

  const familyManual = await createObservation(resident.id, family.id);
  await expectDeleted(family.client, familyManual, "authorized family deletion");

  const revokedFamilyManual = await createObservation(resident.id, family.id);
  const { error: revokeError } = await admin.from("family_bindings").update({ status: "disabled" }).eq("id", bindingId);
  if (revokeError) throw revokeError;
  await expectRpcError(family.client, revokedFamilyManual, "FORBIDDEN", "revoked family deletion");
  await expectDeleted(resident.client, revokedFamilyManual, "resident deletion after family revocation");

  const { count, error: auditError } = await admin.from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "health_observation.deleted")
    .in("target_id", [residentManual, familyManual, revokedFamilyManual]);
  if (auditError || count !== 3) throw auditError ?? new Error(`Expected 3 deletion audit rows, received ${count}.`);
  assertions += 1;

  console.log(`Verified ${assertions} health observation lifecycle assertions: owner deletion, active family scope, revoked-family denial, imported-source immutability, and audit evidence.`);
} finally {
  if (observationIds.length) {
    await admin.from("audit_logs").delete().eq("action", "health_observation.deleted").in("target_id", observationIds);
    await admin.from("health_observations").delete().in("id", observationIds);
  }
  if (bindingId) await admin.from("family_bindings").delete().eq("id", bindingId);
  for (const userId of userIds.reverse()) await admin.auth.admin.deleteUser(userId);
}
