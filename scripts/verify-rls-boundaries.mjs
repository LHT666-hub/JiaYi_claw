import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error("verify:rls only runs against the local Supabase stack.");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const password = `Local-${randomBytes(12).toString("hex")}!`;
const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const createdUserIds = [];
const cleanup = {
  organizationIds: [],
  communityIds: [],
  healthIds: [],
  requestIds: [],
  briefIds: [],
  skillRunIds: [],
  inviteIds: [],
  publicInfoIds: [],
  groupMessageIds: [],
  todoIds: [],
  auditIds: [],
};

async function createAccount(label, role, organizationId, communityId) {
  const email = `verify-rls-${label}-${suffix}@example.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${label}.`);
  createdUserIds.push(data.user.id);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ display_name: `RLS ${label}`, role, organization_id: organizationId, community_id: communityId, account_status: "active" })
    .eq("id", data.user.id);
  if (profileError) throw profileError;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { client, id: data.user.id };
}

async function insertOne(table, values, cleanupKey) {
  const { data, error } = await admin.from(table).insert(values).select("id").single();
  if (error || !data) throw error ?? new Error(`Unable to seed ${table}.`);
  if (cleanupKey) cleanup[cleanupKey].push(data.id);
  return data.id;
}

async function expectVisible(client, table, id, expected, label) {
  const { data, error } = await client.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`${label}: ${error.message}`);
  if (Boolean(data) !== expected) {
    throw new Error(`${label}: expected ${expected ? "visible" : "hidden"}, received ${data ? "visible" : "hidden"}.`);
  }
}

async function expectDenied(operation, label) {
  const result = await operation();
  if (!result.error) throw new Error(`${label}: mutation unexpectedly succeeded.`);
}

async function seedResidentData(residentId, recordedBy, organizationId, communityId, tag) {
  const now = new Date().toISOString();
  const healthId = await insertOne("health_observations", {
    resident_id: residentId,
    recorded_by: recordedBy,
    observation_type: "weight",
    value: 60,
    unit: "kg",
    measured_at: now,
    note: `RLS ${tag}`,
  }, "healthIds");

  const requestId = await insertOne("service_requests", {
    organization_id: organizationId,
    community_id: communityId,
    resident_id: residentId,
    requested_by: residentId,
    service_type: "family_doctor_booking",
    title: `RLS ${tag}`,
    summary: `RLS boundary verification ${tag}`,
    status: "submitted",
    idempotency_key: `verify-rls-${tag}-${suffix}`,
    source: "verification",
  }, "requestIds");

  const briefId = await insertOne("clinical_briefs", {
    resident_id: residentId,
    service_request_id: requestId,
    summary: `RLS clinical brief ${tag}`,
    skill_id: "clinician-previsit-summary",
    skill_version: "verify",
  }, "briefIds");

  const skillRunId = await insertOne("skill_runs", {
    user_id: residentId,
    resident_id: residentId,
    skill_id: "safety-triage",
    skill_version: "verify",
    trace_id: `verify-rls-${tag}-${suffix}`,
    status: "success",
  }, "skillRunIds");

  return { healthId, requestId, briefId, skillRunId };
}

try {
  const { data: primaryOrganization, error: primaryOrgError } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "fengxian-primary-care")
    .single();
  if (primaryOrgError) throw primaryOrgError;

  const { data: primaryCommunity, error: primaryCommunityError } = await admin
    .from("communities")
    .select("id")
    .eq("organization_id", primaryOrganization.id)
    .eq("slug", "haiwan-town")
    .single();
  if (primaryCommunityError) throw primaryCommunityError;

  const secondaryCommunityId = await insertOne("communities", {
    organization_id: primaryOrganization.id,
    slug: `verify-secondary-${suffix}`,
    name: "RLS 同机构第二社区",
    district: "验证数据",
  }, "communityIds");

  const otherOrganizationId = await insertOne("organizations", {
    slug: `verify-other-${suffix}`,
    name: "RLS 其他机构",
  }, "organizationIds");
  const otherCommunityId = await insertOne("communities", {
    organization_id: otherOrganizationId,
    slug: `verify-other-community-${suffix}`,
    name: "RLS 其他机构社区",
    district: "验证数据",
  }, "communityIds");

  const residentA = await createAccount("resident-a", "resident", primaryOrganization.id, primaryCommunity.id);
  const residentA2 = await createAccount("resident-a2", "resident", primaryOrganization.id, secondaryCommunityId);
  const residentB = await createAccount("resident-b", "resident", otherOrganizationId, otherCommunityId);
  const familyAuthorized = await createAccount("family-authorized", "family", primaryOrganization.id, primaryCommunity.id);
  const familyUnrelated = await createAccount("family-unrelated", "family", primaryOrganization.id, primaryCommunity.id);
  const staffA = await createAccount("staff-a", "doctor", primaryOrganization.id, primaryCommunity.id);
  const staffA2 = await createAccount("staff-a2", "doctor", primaryOrganization.id, secondaryCommunityId);
  const staffB = await createAccount("staff-b", "doctor", otherOrganizationId, otherCommunityId);
  const adminA = await createAccount("admin-a", "admin", primaryOrganization.id, primaryCommunity.id);

  const { error: bindingError } = await admin.from("family_bindings").insert({
    resident_id: residentA.id,
    family_id: familyAuthorized.id,
    relationship: "女儿",
    status: "active",
  });
  if (bindingError) throw bindingError;

  const dataA = await seedResidentData(residentA.id, residentA.id, primaryOrganization.id, primaryCommunity.id, "A");
  const dataA2 = await seedResidentData(residentA2.id, residentA2.id, primaryOrganization.id, secondaryCommunityId, "A2");
  const dataB = await seedResidentData(residentB.id, residentB.id, otherOrganizationId, otherCommunityId, "B");

  const inviteBId = await insertOne("staff_invites", {
    organization_id: otherOrganizationId,
    community_id: otherCommunityId,
    phone: "+8613800000000",
    display_name: "RLS 其他机构员工",
    role: "doctor",
    token_hash: `verify-${suffix}`,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    invited_by: staffB.id,
  }, "inviteIds");

  const publicInfoBId = await insertOne("public_info_entries", {
    organization_id: otherOrganizationId,
    community_id: otherCommunityId,
    title: "RLS 其他机构内部草稿",
    category: "verification",
    content: "This row must not be administrable across organizations.",
    source_name: "RLS verification",
    source_url: `https://example.local/${suffix}`,
    verified_at: new Date().toISOString(),
    status: "draft",
  }, "publicInfoIds");

  const groupMessageBId = await insertOne("group_messages", {
    group_id: `verify-${suffix}`,
    sender_id: residentB.id,
    sender_name: "RLS 居民 B",
    sender_role: "resident",
    content: "private legacy message",
  }, "groupMessageIds");

  const todoBId = await insertOne("doctor_todos", {
    resident_id: residentB.id,
    assigned_to: staffB.id,
    type: "verification",
    title: "RLS 其他机构待办",
    description: "Must remain tenant scoped.",
    risk_level: "low",
    status: "pending",
    source: "verification",
  }, "todoIds");

  const auditBId = await insertOne("audit_logs", {
    actor_id: staffB.id,
    action: "rls.verify",
    target_table: "profiles",
    target_id: residentB.id,
    detail: { synthetic: true },
  }, "auditIds");

  for (const [client, own, foreign, label] of [
    [residentA.client, dataA, dataB, "居民"],
    [familyAuthorized.client, dataA, dataB, "已授权家属"],
    [staffA.client, dataA, dataB, "本社区工作人员"],
  ]) {
    await expectVisible(client, "health_observations", own.healthId, true, `${label}读取授权健康记录`);
    await expectVisible(client, "service_requests", own.requestId, true, `${label}读取授权服务申请`);
    await expectVisible(client, "clinical_briefs", own.briefId, true, `${label}读取授权接诊摘要`);
    await expectVisible(client, "health_observations", foreign.healthId, false, `${label}不能跨机构读取健康记录`);
    await expectVisible(client, "service_requests", foreign.requestId, false, `${label}不能跨机构读取服务申请`);
    await expectVisible(client, "clinical_briefs", foreign.briefId, false, `${label}不能跨机构读取接诊摘要`);
  }

  await expectVisible(familyUnrelated.client, "profiles", residentA.id, false, "未授权家属不能读取居民资料");
  await expectVisible(familyUnrelated.client, "health_observations", dataA.healthId, false, "未授权家属不能读取健康记录");
  await expectVisible(familyUnrelated.client, "service_requests", dataA.requestId, false, "未授权家属不能读取服务申请");

  await expectVisible(residentA.client, "profiles", residentB.id, false, "居民不能读取其他居民资料");
  await expectVisible(staffA.client, "profiles", residentA2.id, false, "工作人员不能跨社区读取居民资料");
  await expectVisible(staffA.client, "health_observations", dataA2.healthId, false, "工作人员不能跨社区读取健康记录");
  await expectVisible(staffA2.client, "health_observations", dataA2.healthId, true, "第二社区工作人员可读本社区记录");
  await expectVisible(staffB.client, "health_observations", dataB.healthId, true, "其他机构工作人员可读本机构记录");
  await expectVisible(staffA.client, "skill_runs", dataB.skillRunId, false, "工作人员不能跨机构读取 Skill 运行");
  await expectVisible(residentA.client, "group_messages", groupMessageBId, false, "旧群消息不再全员可读");
  await expectVisible(staffA.client, "doctor_todos", todoBId, false, "旧待办不能跨机构读取");
  await expectVisible(adminA.client, "staff_invites", inviteBId, false, "管理员不能跨机构读取邀请");
  await expectVisible(adminA.client, "audit_logs", auditBId, false, "管理员不能跨机构读取审计日志");

  await expectDenied(
    () => residentA.client.from("health_observations").insert({
      resident_id: residentB.id,
      recorded_by: residentA.id,
      observation_type: "weight",
      value: 99,
      unit: "kg",
      measured_at: new Date().toISOString(),
    }),
    "居民不能给其他居民写健康记录",
  );
  await expectDenied(
    () => familyUnrelated.client.from("health_observations").insert({
      resident_id: residentA.id,
      recorded_by: familyUnrelated.id,
      observation_type: "weight",
      value: 99,
      unit: "kg",
      measured_at: new Date().toISOString(),
    }),
    "未授权家属不能写健康记录",
  );
  await expectDenied(
    () => staffA.client.from("clinical_briefs").insert({
      resident_id: residentA.id,
      summary: "direct client write",
      skill_id: "fake",
      skill_version: "fake",
    }),
    "工作人员客户端不能直接写临床摘要",
  );
  await expectDenied(
    () => adminA.client.from("staff_invites").insert({
      organization_id: otherOrganizationId,
      community_id: otherCommunityId,
      phone: "+8613900000000",
      display_name: "cross tenant",
      role: "doctor",
      token_hash: `cross-${suffix}`,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      invited_by: adminA.id,
    }),
    "管理员不能跨机构创建邀请",
  );
  await expectDenied(
    () => adminA.client.from("public_info_entries").insert({
      organization_id: otherOrganizationId,
      community_id: otherCommunityId,
      title: "cross tenant",
      category: "verification",
      content: "cross tenant",
      source_name: "verification",
      source_url: `https://example.local/cross-${suffix}`,
      verified_at: new Date().toISOString(),
      status: "draft",
    }),
    "管理员不能跨机构创建公开信息",
  );
  await expectDenied(
    () => staffA.client.rpc("transition_service_request", {
      p_request_id: dataB.requestId,
      p_action: "accept",
      p_note: "cross tenant",
      p_details: {},
    }),
    "工作人员不能跨机构推进服务状态",
  );

  const { error: escalationError } = await residentA.client.from("profiles").update({ role: "admin" }).eq("id", residentA.id);
  if (!escalationError) throw new Error("居民角色升级请求未被 RLS 明确拒绝。");
  const { data: unchangedRole, error: roleCheckError } = await admin.from("profiles").select("role").eq("id", residentA.id).single();
  if (roleCheckError || unchangedRole.role !== "resident") throw roleCheckError ?? new Error("居民角色被非法提升。");

  const { data: unchangedInfo, error: infoCheckError } = await admin.from("public_info_entries").select("title").eq("id", publicInfoBId).single();
  if (infoCheckError || unchangedInfo.title !== "RLS 其他机构内部草稿") throw infoCheckError ?? new Error("跨机构公开信息被修改。");

  console.log("Verified 42 RLS assertions: resident isolation, family authorization, community and organization boundaries, protected clinical writes, scoped admin operations, legacy privacy, and role-escalation blocking.");
} finally {
  const deleteByIds = async (table, ids) => {
    if (ids.length) await admin.from(table).delete().in("id", ids);
  };
  await deleteByIds("audit_logs", cleanup.auditIds);
  await deleteByIds("doctor_todos", cleanup.todoIds);
  await deleteByIds("group_messages", cleanup.groupMessageIds);
  await deleteByIds("public_info_entries", cleanup.publicInfoIds);
  await deleteByIds("staff_invites", cleanup.inviteIds);
  await deleteByIds("skill_runs", cleanup.skillRunIds);
  await deleteByIds("clinical_briefs", cleanup.briefIds);
  await deleteByIds("service_requests", cleanup.requestIds);
  await deleteByIds("health_observations", cleanup.healthIds);
  if (createdUserIds.length) await admin.from("family_bindings").delete().in("resident_id", createdUserIds);
  for (const id of createdUserIds.reverse()) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  await deleteByIds("communities", cleanup.communityIds);
  await deleteByIds("organizations", cleanup.organizationIds);
}
