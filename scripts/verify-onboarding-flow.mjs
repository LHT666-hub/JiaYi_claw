import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error("verify:onboarding only runs against the local Supabase stack.");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const password = `Local-${randomBytes(12).toString("hex")}!`;
const suffix = Date.now();
const createdUserIds = [];

async function createTestAccount(label) {
  const email = `verify-${label}-${suffix}@example.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${label} account.`);
  createdUserIds.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { client, user: data.user };
}

try {
  const { data: community, error: communityError } = await admin.from("communities").select("id,organization_id").eq("slug", "haiwan-town").single();
  if (communityError) throw communityError;

  const resident = await createTestAccount("resident");
  const family = await createTestAccount("family");
  const communityStaff = await createTestAccount("community");

  const { error: staffProfileError } = await admin.from("profiles").update({
    display_name: "核验社区工作人员",
    role: "community",
    organization_id: community.organization_id,
    community_id: community.id,
    onboarding_completed_at: new Date().toISOString(),
  }).eq("id", communityStaff.user.id);
  if (staffProfileError) throw staffProfileError;

  const { error: escalationError } = await resident.client.from("profiles").update({ role: "admin" }).eq("id", resident.user.id);
  if (!escalationError) throw new Error("Profile privilege escalation was not blocked.");

  const baseConsents = { privacy: true, sensitive_health: true, ai_processing: true, notification: true };
  const { error: residentOnboardingError } = await resident.client.rpc("complete_public_onboarding", {
    p_display_name: "验证居民",
    p_role: "resident",
    p_community_id: community.id,
    p_policy_version: "2026-08-11",
    p_consents: baseConsents,
  });
  if (residentOnboardingError) throw residentOnboardingError;

  const { data: pendingCareBinding, error: pendingBindingError } = await resident.client
    .from("resident_care_bindings")
    .select("id,status,verified_at")
    .eq("resident_id", resident.user.id)
    .eq("status", "pending")
    .single();
  if (pendingBindingError || !pendingCareBinding || pendingCareBinding.verified_at) {
    throw pendingBindingError ?? new Error("New resident care binding was not queued for verification.");
  }

  const { error: selfReviewError } = await resident.client.rpc("review_resident_care_binding", {
    p_binding_id: pendingCareBinding.id,
    p_decision: "active",
    p_note: "居民不得自行核验",
  });
  if (!selfReviewError) throw new Error("Resident was able to self-verify a care binding.");

  const { data: verifiedCareBinding, error: reviewError } = await communityStaff.client.rpc(
    "review_resident_care_binding",
    {
      p_binding_id: pendingCareBinding.id,
      p_decision: "active",
      p_note: "自动化测试核验",
    },
  );
  if (reviewError || verifiedCareBinding?.status !== "active" || !verifiedCareBinding?.verified_at) {
    throw reviewError ?? new Error("Community staff could not verify the resident care binding.");
  }

  const { error: familyOnboardingError } = await family.client.rpc("complete_public_onboarding", {
    p_display_name: "验证家属",
    p_role: "family",
    p_community_id: community.id,
    p_policy_version: "2026-08-11",
    p_consents: { ...baseConsents, sensitive_health: false },
  });
  if (familyOnboardingError) throw familyOnboardingError;

  const readableCode = "A7K9M4Q2";
  const codeHash = createHash("sha256").update(readableCode).digest("hex");
  const { error: codeError } = await resident.client.rpc("create_family_link_code", {
    p_code_hash: codeHash,
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    p_policy_version: "2026-08-11",
  });
  if (codeError) throw codeError;

  const { data: binding, error: redeemError } = await family.client.rpc("redeem_family_link_code", {
    p_code_hash: codeHash,
    p_relationship: "女儿",
  });
  if (redeemError || !binding || binding.status !== "active") throw redeemError ?? new Error("Family link was not activated.");

  const { count, error: consentError } = await admin.from("consents").select("id", { count: "exact", head: true }).in("user_id", [resident.user.id, family.user.id]);
  if (consentError || count !== 9) throw consentError ?? new Error(`Expected 9 consent records, received ${count}.`);

  console.log("Verified: role escalation blocked; new resident binding stayed pending until community review; resident/family onboarding completed; one-time family link activated; consent rows audited.");
} finally {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
}
