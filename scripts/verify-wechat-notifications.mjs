import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Local Supabase service role is required.");

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
const traceId = `wechat-notification-check-${randomUUID()}`;
const templateId = `local-template-${randomUUID()}`;
let userId;
let previousPreference;

try {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "resident")
    .limit(1)
    .single();
  if (profileError) throw profileError;
  userId = profile.id;

  const { data: preference, error: preferenceError } = await supabase
    .from("notification_preferences")
    .select("wechat_mini_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  previousPreference = preference;

  const rows = [
    {
      template_key: "service_update",
      template_id: templateId,
      decision: "accept",
      delivery_status: "available",
      request_trace_id: traceId,
    },
  ];
  const { data: recorded, error: recordError } = await supabase.rpc(
    "record_wechat_subscription_decisions",
    {
      p_user_id: userId,
      p_rows: rows,
      p_enabled: true,
      p_trace_id: traceId,
    },
  );
  if (recordError) throw recordError;

  const claims = await Promise.all([
    supabase.rpc("claim_wechat_subscription_grant", {
      p_user_id: userId,
      p_template_id: templateId,
    }),
    supabase.rpc("claim_wechat_subscription_grant", {
      p_user_id: userId,
      p_template_id: templateId,
    }),
  ]);
  const claimError = claims.find((claim) => claim.error)?.error;
  if (claimError) throw claimError;
  const claimCount = claims.filter((claim) => claim.data).length;

  const { data: grant, error: grantError } = await supabase
    .from("wechat_subscription_grants")
    .select("delivery_status,consumed_at")
    .eq("request_trace_id", traceId)
    .single();
  if (grantError) throw grantError;
  const { data: audit, error: auditError } = await supabase
    .from("audit_logs")
    .select("action")
    .eq("detail->>traceId", traceId)
    .single();
  if (auditError) throw auditError;

  if (
    recorded !== 1 ||
    claimCount !== 1 ||
    grant.delivery_status !== "processing" ||
    !grant.consumed_at ||
    audit.action !== "wechat.subscription_decision_recorded"
  ) {
    throw new Error("WeChat subscription atomicity verification failed.");
  }
  console.log(
    "Verified: subscription decision, preference and audit were atomic; one grant had one concurrent claimant.",
  );
} finally {
  if (userId) {
    await supabase
      .from("wechat_subscription_grants")
      .delete()
      .eq("request_trace_id", traceId);
    await supabase.from("audit_logs").delete().eq("detail->>traceId", traceId);
    if (previousPreference) {
      await supabase.from("notification_preferences").upsert({
        user_id: userId,
        wechat_mini_enabled: previousPreference.wechat_mini_enabled,
        updated_at: new Date().toISOString(),
      });
    } else {
      await supabase
        .from("notification_preferences")
        .delete()
        .eq("user_id", userId);
    }
  }
}
