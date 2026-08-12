import { randomBytes, randomUUID } from "node:crypto";
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
let assertions = 0;
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
  askLogIds: [],
  familyLinkCodeIds: [],
  notificationIds: [],
  outboxIds: [],
  wechatIdentityIds: [],
  feedbackIds: [],
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
  assertions += 1;
}

async function expectDenied(operation, label) {
  const result = await operation();
  if (!result.error) throw new Error(`${label}: mutation unexpectedly succeeded.`);
  assertions += 1;
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
  const staffA3 = await createAccount("staff-a3", "nurse", primaryOrganization.id, primaryCommunity.id);
  const staffA2 = await createAccount("staff-a2", "doctor", primaryOrganization.id, secondaryCommunityId);
  const staffB = await createAccount("staff-b", "doctor", otherOrganizationId, otherCommunityId);
  const adminA = await createAccount("admin-a", "admin", primaryOrganization.id, primaryCommunity.id);
  const communityA = await createAccount("community-a", "community", primaryOrganization.id, primaryCommunity.id);

  const { data: familyBinding, error: bindingError } = await admin
    .from("family_bindings")
    .insert({
      resident_id: residentA.id,
      family_id: familyAuthorized.id,
      relationship: "女儿",
      status: "active",
    })
    .select("id")
    .single();
  if (bindingError || !familyBinding) throw bindingError ?? new Error("Unable to seed family binding.");

  const dataA = await seedResidentData(residentA.id, residentA.id, primaryOrganization.id, primaryCommunity.id, "A");
  const dataA2 = await seedResidentData(residentA2.id, residentA2.id, primaryOrganization.id, secondaryCommunityId, "A2");
  const dataB = await seedResidentData(residentB.id, residentB.id, otherOrganizationId, otherCommunityId, "B");

  const feedbackAId = await insertOne("user_feedback", {
    organization_id: primaryOrganization.id,
    community_id: primaryCommunity.id,
    user_id: residentA.id,
    resident_id: residentA.id,
    category: "service",
    content: "RLS 本社区居民反馈内容",
    idempotency_key: `verify-feedback-a-${suffix}`,
  }, "feedbackIds");
  const feedbackA2Id = await insertOne("user_feedback", {
    organization_id: primaryOrganization.id,
    community_id: secondaryCommunityId,
    user_id: residentA2.id,
    resident_id: residentA2.id,
    category: "bug",
    content: "RLS 同机构其他社区反馈内容",
    idempotency_key: `verify-feedback-a2-${suffix}`,
  }, "feedbackIds");
  const feedbackBId = await insertOne("user_feedback", {
    organization_id: otherOrganizationId,
    community_id: otherCommunityId,
    user_id: residentB.id,
    resident_id: residentB.id,
    category: "privacy",
    content: "RLS 其他机构居民反馈内容",
    idempotency_key: `verify-feedback-b-${suffix}`,
  }, "feedbackIds");
  await admin.from("user_feedback_events").insert({
    feedback_id: feedbackAId,
    actor_id: residentA.id,
    action: "submitted",
    to_status: "open",
  });

  const { error: claimError } = await staffA.client.rpc("transition_service_request", {
    p_request_id: dataA.requestId,
    p_action: "accept",
    p_note: "RLS 经办人认领验证",
    p_details: {},
  });
  if (claimError) throw claimError;
  const { error: requestInfoError } = await staffA.client.rpc("transition_service_request", {
    p_request_id: dataA.requestId,
    p_action: "request_info",
    p_note: "请补充最近检查日期",
    p_details: {},
  });
  if (requestInfoError) throw requestInfoError;
  const { error: supplementError } = await residentA.client.rpc("transition_service_request", {
    p_request_id: dataA.requestId,
    p_action: "submit",
    p_note: "居民已补充最近检查日期",
    p_details: {},
  });
  if (supplementError) throw supplementError;
  await expectDenied(
    () => staffA3.client.rpc("transition_service_request", {
      p_request_id: dataA.requestId,
      p_action: "accept",
      p_note: "其他工作人员重复认领",
      p_details: {},
    }),
    "已认领申请不能被其他工作人员并发处理",
  );
  const { data: claimedRequest, error: claimedRequestError } = await admin
    .from("service_requests")
    .select("assigned_to,assigned_role")
    .eq("id", dataA.requestId)
    .single();
  if (claimedRequestError || claimedRequest.assigned_to !== staffA.id || claimedRequest.assigned_role !== "doctor") {
    throw claimedRequestError ?? new Error("服务申请没有原子记录经办人。");
  }
  assertions += 1;
  const { data: activeAssignment, error: assignmentError } = await admin
    .from("service_assignments")
    .select("assigned_to,active")
    .eq("service_request_id", dataA.requestId)
    .eq("active", true)
    .single();
  if (assignmentError || activeAssignment.assigned_to !== staffA.id) throw assignmentError ?? new Error("活动经办记录不正确。");
  assertions += 1;
  const { data: residentOutbox, error: residentOutboxError } = await admin
    .from("outbox_events")
    .select("id,recipient_id,payload")
    .eq("aggregate_id", dataA.requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (residentOutboxError || residentOutbox.recipient_id !== staffA.id || residentOutbox.payload?.actorRole !== "resident") {
    throw residentOutboxError ?? new Error("居民补充资料没有通知原经办人。");
  }
  assertions += 1;
  const { data: generatedOutbox } = await admin.from("outbox_events").select("id").eq("aggregate_id", dataA.requestId);
  cleanup.outboxIds.push(...(generatedOutbox ?? []).map((item) => item.id));
  const { data: generatedAudit } = await admin.from("audit_logs").select("id").eq("target_id", dataA.requestId).like("action", "service_request.%");
  cleanup.auditIds.push(...(generatedAudit ?? []).map((item) => item.id));

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

  const askLogBId = await insertOne("ask_logs", {
    user_id: residentB.id,
    question: "RLS 其他机构私密问答",
    answer: "synthetic",
    source: "verification",
    risk_level: "low",
    suggest_doctor: false,
  }, "askLogIds");
  const familyLinkCodeBId = await insertOne("family_link_codes", {
    resident_id: residentB.id,
    code_hash: randomBytes(32).toString("hex"),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }, "familyLinkCodeIds");
  const notificationBId = await insertOne("notifications", {
    user_id: residentB.id,
    type: "system",
    title: "RLS 其他机构通知",
    content: "private notification",
  }, "notificationIds");
  const outboxBId = await insertOne("outbox_events", {
    event_type: "service_request.status_changed",
    aggregate_type: "service_request",
    aggregate_id: randomUUID(),
    recipient_id: residentB.id,
    payload: { requestId: randomUUID(), status: "submitted" },
  }, "outboxIds");
  const wechatIdentityBId = await insertOne("wechat_identities", {
    user_id: residentB.id,
    app_id: `verify-${suffix}`,
    open_id: `verify-open-${suffix}`,
  }, "wechatIdentityIds");

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
  await expectVisible(residentA.client, "skill_runs", dataB.skillRunId, false, "居民不能读取其他居民的 Skill 运行");
  await expectVisible(residentA.client, "group_messages", groupMessageBId, false, "旧群消息不再全员可读");
  await expectVisible(staffA.client, "doctor_todos", todoBId, false, "旧待办不能跨机构读取");
  await expectVisible(adminA.client, "staff_invites", inviteBId, false, "管理员不能跨机构读取邀请");
  await expectVisible(adminA.client, "audit_logs", auditBId, false, "管理员不能跨机构读取审计日志");
  await expectVisible(adminA.client, "public_info_entries", publicInfoBId, false, "管理员不能读取其他机构草稿");
  await expectVisible(adminA.client, "ask_logs", askLogBId, false, "管理员不能跨机构读取问答记录");
  await expectVisible(adminA.client, "family_link_codes", familyLinkCodeBId, false, "管理员不能跨机构读取家属邀请码");
  await expectVisible(adminA.client, "notifications", notificationBId, false, "管理员不能跨机构读取居民通知");
  await expectVisible(adminA.client, "outbox_events", outboxBId, false, "管理员不能跨机构读取通知队列");
  await expectVisible(adminA.client, "wechat_identities", wechatIdentityBId, false, "管理员不能跨机构读取微信身份");
  await expectVisible(residentA.client, "user_feedback", feedbackAId, true, "居民可读取自己的反馈");
  await expectVisible(residentA.client, "user_feedback", feedbackA2Id, false, "居民不能读取其他居民反馈");
  await expectVisible(communityA.client, "user_feedback", feedbackAId, true, "社区工作人员可读取本社区反馈");
  await expectVisible(communityA.client, "user_feedback", feedbackA2Id, false, "社区工作人员不能跨社区读取反馈");
  await expectVisible(communityA.client, "user_feedback", feedbackBId, false, "社区工作人员不能跨机构读取反馈");
  await expectVisible(adminA.client, "user_feedback", feedbackA2Id, true, "机构管理员可读取同机构反馈");
  await expectVisible(adminA.client, "user_feedback", feedbackBId, false, "机构管理员不能跨机构读取反馈");
  const { data: ownFeedbackEvents, error: ownFeedbackEventsError } = await residentA.client
    .from("user_feedback_events").select("id").eq("feedback_id", feedbackAId);
  if (ownFeedbackEventsError || !ownFeedbackEvents?.length) throw ownFeedbackEventsError ?? new Error("居民无法读取自己的反馈事件。");
  assertions += 1;

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
    () => residentA.client.from("user_feedback").insert({
      organization_id: primaryOrganization.id,
      community_id: primaryCommunity.id,
      user_id: residentA.id,
      category: "other",
      content: "客户端不能绕过反馈接口直接写入",
      idempotency_key: `direct-feedback-${suffix}`,
    }),
    "居民客户端不能绕过反馈接口直接写入",
  );
  await expectDenied(
    () => staffA.client.rpc("update_user_feedback", {
      p_feedback_id: feedbackAId,
      p_status: "in_progress",
      p_resolution_note: null,
    }),
    "医生不能绕过管理接口处理居民反馈",
  );
  await expectDenied(
    () => communityA.client.rpc("update_user_feedback", {
      p_feedback_id: feedbackA2Id,
      p_status: "in_progress",
      p_resolution_note: null,
    }),
    "社区工作人员不能跨社区处理反馈",
  );
  const { data: updatedFeedback, error: updateFeedbackError } = await communityA.client.rpc("update_user_feedback", {
    p_feedback_id: feedbackAId,
    p_status: "in_progress",
    p_resolution_note: null,
  });
  if (updateFeedbackError || updatedFeedback?.status !== "in_progress") throw updateFeedbackError ?? new Error("社区工作人员无法处理本社区反馈。");
  assertions += 1;
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
  const { data: residentObservation, error: residentObservationError } = await residentA.client
    .from("health_observations")
    .insert({
      resident_id: residentA.id,
      recorded_by: residentA.id,
      observation_type: "blood_pressure",
      value: 126,
      secondary_value: 78,
      unit: "mmHg",
      measured_at: new Date().toISOString(),
      note: "居民本人录入验证",
    })
    .select("id")
    .single();
  if (residentObservationError || !residentObservation) {
    throw residentObservationError ?? new Error("居民无法录入自己的健康记录。");
  }
  cleanup.healthIds.push(residentObservation.id);
  assertions += 1;

  const { data: familyObservation, error: familyObservationError } = await familyAuthorized.client
    .from("health_observations")
    .insert({
      resident_id: residentA.id,
      recorded_by: familyAuthorized.id,
      observation_type: "blood_glucose",
      value: 5.6,
      unit: "mmol/L",
      measured_at: new Date().toISOString(),
      note: "已授权家属代录验证",
    })
    .select("id")
    .single();
  if (familyObservationError || !familyObservation) {
    throw familyObservationError ?? new Error("已授权家属无法代录健康记录。");
  }
  cleanup.healthIds.push(familyObservation.id);
  assertions += 1;

  await expectDenied(
    () => residentA.client.from("health_observations").insert({
      resident_id: residentA.id,
      recorded_by: residentA.id,
      observation_type: "weight",
      value: 9999,
      unit: "kg",
      measured_at: new Date().toISOString(),
    }),
    "绕过客户端的异常健康数值仍被数据库拒绝",
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
    () => residentA.client.rpc("create_staff_invite", {
      p_phone: "+8613900000000",
      p_display_name: "resident forged invite",
      p_role: "admin",
      p_community_id: primaryCommunity.id,
      p_token_hash: `resident-forged-${suffix}`,
      p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    "居民不能调用人员邀请事务",
  );
  await expectDenied(
    () => staffA.client.rpc("set_staff_account_status", {
      p_profile_id: adminA.id,
      p_status: "disabled",
    }),
    "非管理员工作人员不能停用其他账号",
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
  await expectDenied(
    () => adminA.client.from("ask_logs").insert({
      user_id: residentB.id,
      question: "cross tenant",
      source: "verification",
      suggest_doctor: false,
    }),
    "管理员不能跨机构伪造问答记录",
  );
  await expectDenied(
    () => residentA.client.from("audit_logs").insert({
      actor_id: residentA.id,
      action: "service_catalog.enabled",
      target_table: "service_catalog",
      detail: { forged: true },
    }),
    "居民不能伪造后台审计事件",
  );
  const staffAuditAction = `verification.staff_action.${suffix}`;
  const { error: staffAuditError } = await staffA.client
    .from("audit_logs")
    .insert({
      actor_id: staffA.id,
      action: staffAuditAction,
      target_table: "profiles",
      target_id: staffA.id,
      detail: { verification: true },
    });
  if (staffAuditError) throw staffAuditError;
  const { data: staffAudit, error: staffAuditReadError } = await admin
    .from("audit_logs")
    .select("id")
    .eq("action", staffAuditAction)
    .eq("actor_id", staffA.id)
    .single();
  if (staffAuditReadError || !staffAudit) throw staffAuditReadError ?? new Error("管理员无法核验工作人员审计记录。");
  cleanup.auditIds.push(staffAudit.id);
  assertions += 1;

  const { error: escalationError } = await residentA.client.from("profiles").update({ role: "admin" }).eq("id", residentA.id);
  if (!escalationError) throw new Error("居民角色升级请求未被 RLS 明确拒绝。");
  assertions += 1;
  const { data: unchangedRole, error: roleCheckError } = await admin.from("profiles").select("role").eq("id", residentA.id).single();
  if (roleCheckError || unchangedRole.role !== "resident") throw roleCheckError ?? new Error("居民角色被非法提升。");
  assertions += 1;

  const { data: unchangedInfo, error: infoCheckError } = await admin.from("public_info_entries").select("title").eq("id", publicInfoBId).single();
  if (infoCheckError || unchangedInfo.title !== "RLS 其他机构内部草稿") throw infoCheckError ?? new Error("跨机构公开信息被修改。");
  assertions += 1;

  await expectDenied(
    () => familyUnrelated.client.rpc("revoke_family_binding", {
      p_binding_id: familyBinding.id,
    }),
    "未授权家属不能解除他人的家属关系",
  );
  const { data: revokedBinding, error: revokeError } = await familyAuthorized.client.rpc(
    "revoke_family_binding",
    { p_binding_id: familyBinding.id },
  );
  if (revokeError || revokedBinding?.status !== "disabled") {
    throw revokeError ?? new Error("已授权家属无法解除自己的家属关系。");
  }
  assertions += 1;
  const { data: revokeAudit, error: revokeAuditError } = await admin
    .from("audit_logs")
    .select("id,action")
    .eq("target_id", familyBinding.id)
    .eq("action", "family_link.revoked")
    .maybeSingle();
  if (revokeAuditError || !revokeAudit) {
    throw revokeAuditError ?? new Error("解除家属授权没有写入审计日志。");
  }
  cleanup.auditIds.push(revokeAudit.id);
  assertions += 1;

  console.log(`Verified ${assertions} RLS assertions: resident isolation, revocable family authorization, community and organization boundaries, protected clinical writes, scoped admin operations, legacy privacy, and role-escalation blocking.`);
} finally {
  const deleteByIds = async (table, ids) => {
    if (ids.length) await admin.from(table).delete().in("id", ids);
  };
  await deleteByIds("audit_logs", cleanup.auditIds);
  await deleteByIds("outbox_events", cleanup.outboxIds);
  await deleteByIds("notifications", cleanup.notificationIds);
  await deleteByIds("wechat_identities", cleanup.wechatIdentityIds);
  await deleteByIds("user_feedback", cleanup.feedbackIds);
  await deleteByIds("family_link_codes", cleanup.familyLinkCodeIds);
  await deleteByIds("ask_logs", cleanup.askLogIds);
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
