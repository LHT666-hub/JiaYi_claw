import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error("verify:wechat-notifications only runs against the local Supabase stack.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
const traceId = `wechat-notification-check-${randomUUID()}`;
const templateId = `local-template-${randomUUID()}`;
let userId;

try {
  const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
    email: `wechat-notification-${randomUUID()}@example.local`,
    password: `Local-${randomUUID()}!`,
    email_confirm: true,
    user_metadata: { display_name: "微信通知验证居民" },
  });
  if (createUserError || !createdUser.user) {
    throw createUserError ?? new Error("Unable to create the notification verification resident.");
  }
  userId = createdUser.user.id;

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
    await supabase.from("notification_preferences").delete().eq("user_id", userId);
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
  }
}
