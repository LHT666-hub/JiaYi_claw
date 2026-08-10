import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error("verify:release-compliance only runs against the local Supabase stack.");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const password = `Local-${randomBytes(12).toString("hex")}!`;
let userId = "";

try {
  const { data: auth, error: createError } = await admin.auth.admin.createUser({ email: `verify-release-${Date.now()}@example.local`, password, email_confirm: true });
  if (createError || !auth.user) throw createError ?? new Error("Unable to create release verification user.");
  userId = auth.user.id;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: auth.user.email, password });
  if (signInError) throw signInError;

  const { data: community, error: communityError } = await admin.from("communities").select("id").eq("slug", "haiwan-town").single();
  if (communityError) throw communityError;
  const { error: onboardingError } = await client.rpc("complete_public_onboarding", { p_display_name: "注销验证居民", p_role: "resident", p_community_id: community.id, p_policy_version: "2026-07-18", p_consents: { privacy: true, sensitive_health: true, ai_processing: true, notification: true } });
  if (onboardingError) throw onboardingError;

  const { error: preferenceError } = await client.from("notification_preferences").upsert({ user_id: userId, service_updates: true, followup_reminders: false, content_updates: true, sms_enabled: false, wecom_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "07:00" });
  if (preferenceError) throw preferenceError;
  const { data: preference } = await client.from("notification_preferences").select("followup_reminders,content_updates,quiet_hours_start").eq("user_id", userId).single();
  if (preference?.followup_reminders !== false || preference?.content_updates !== true) throw new Error("Notification preferences were not persisted.");

  const { data: firstRequest, error: requestError } = await client.rpc("request_my_account_deletion", { p_reason: "自动化冷静期验证" });
  if (requestError || !firstRequest?.id || firstRequest.status !== "pending") throw requestError ?? new Error("Deletion request was not created.");
  const coolingDays = (new Date(firstRequest.scheduled_for).getTime() - Date.now()) / 86_400_000;
  if (coolingDays < 6.9 || coolingDays > 7.1) throw new Error("Deletion cooling period is not seven days.");
  const { data: cancelled, error: cancelError } = await client.rpc("cancel_my_account_deletion");
  if (cancelError || cancelled?.status !== "cancelled") throw cancelError ?? new Error("Deletion request was not cancelled.");

  const { data: secondRequest, error: secondError } = await client.rpc("request_my_account_deletion", { p_reason: "自动化到期处理验证" });
  if (secondError || !secondRequest?.id) throw secondError ?? new Error("Second deletion request was not created.");
  const { error: observationError } = await admin.from("health_observations").insert({ resident_id: userId, recorded_by: userId, observation_type: "weight", value: 65, unit: "kg", measured_at: new Date().toISOString(), note: "应被注销流程删除" });
  if (observationError) throw observationError;
  const { error: legacyProfileError } = await admin.from("resident_profiles").upsert({ user_id: userId, age: 65, chronic_tags: ["高血压"] }, { onConflict: "user_id" });
  if (legacyProfileError) throw legacyProfileError;
  const { error: legacyAskError } = await admin.from("ask_logs").insert({ user_id: userId, question: "应被注销流程删除的历史问题", answer: "测试", source: "verification", risk_level: "low", suggest_doctor: false });
  if (legacyAskError) throw legacyAskError;
  await admin.from("account_deletion_requests").update({ scheduled_for: new Date(Date.now() - 60_000).toISOString() }).eq("id", secondRequest.id);
  const { data: processedUserId, error: processError } = await admin.rpc("begin_due_account_deletion", { p_request_id: secondRequest.id });
  if (processError || processedUserId !== userId) throw processError ?? new Error("Deletion processing did not claim the expected user.");

  const { data: profile } = await admin.from("profiles").select("display_name,phone,account_status").eq("id", userId).single();
  const { count: observations } = await admin.from("health_observations").select("id", { count: "exact", head: true }).eq("resident_id", userId);
  const { count: legacyProfiles } = await admin.from("resident_profiles").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const { count: legacyAsks } = await admin.from("ask_logs").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (profile?.account_status !== "disabled" || profile?.phone !== null || profile?.display_name !== "已注销用户" || observations !== 0 || legacyProfiles !== 0 || legacyAsks !== 0) throw new Error("Deletion anonymization did not remove current and legacy resident data.");

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId, true);
  if (deleteAuthError) throw deleteAuthError;
  await admin.from("account_deletion_requests").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", secondRequest.id);
  console.log("Verified: notification preferences persisted; deletion cooling-off/cancel worked; due deletion anonymized identity and removed current/legacy health data.");
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}
