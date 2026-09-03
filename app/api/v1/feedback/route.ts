import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { resolveResidentScope } from "@/lib/db/carePlatform";
import {
  feedbackCategoryLabels,
  feedbackInput,
  parseIdempotencyKey,
} from "@/lib/feedback";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth.supabase) {
    const parsed = feedbackInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("INVALID_FEEDBACK", parsed.error.issues[0]?.message ?? "反馈信息不完整。", 400, traceId);
    }
    return apiOk({
      demo: true,
      simulated: true,
      duplicate: false,
      feedback: {
        id: crypto.randomUUID(),
        status: "open",
        category: parsed.data.category,
        content: parsed.data.content,
        created_at: new Date().toISOString(),
      },
    }, traceId, 201);
  }
  if (!auth.supabase || !auth.profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }
  if (!["resident", "family"].includes(auth.profile.role)) {
    return apiError("FEEDBACK_ROLE_FORBIDDEN", "当前账号不能提交居民反馈。", 403, traceId);
  }
  if (!auth.profile.organization_id) {
    return apiError("TENANT_NOT_CONFIGURED", "账号尚未绑定服务机构。", 409, traceId);
  }

  const parsed = feedbackInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "INVALID_FEEDBACK",
      parsed.error.issues[0]?.message ?? "反馈信息不完整。",
      400,
      traceId,
    );
  }
  const idempotencyKey = parseIdempotencyKey(
    request.headers.get("idempotency-key"),
  );
  if (!idempotencyKey) {
    return apiError("IDEMPOTENCY_KEY_REQUIRED", "请重新提交本次反馈。", 400, traceId);
  }

  let residentId: string | null = null;
  try {
    residentId = await resolveResidentScope(
      auth.profile,
      auth.supabase,
      parsed.data.residentId,
    );
  } catch (error) {
    if (!(auth.profile.role === "family" && error instanceof Error && error.message === "BOUND_RESIDENT_REQUIRED")) {
      return apiError("RESIDENT_SCOPE_FORBIDDEN", "无法为该服务对象提交反馈。", 403, traceId);
    }
  }

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    return apiError("SERVICE_NOT_CONFIGURED", "反馈通道正在配置，请稍后再试。", 503, traceId);
  }

  const existing = await service
    .from("user_feedback")
    .select("id,status,created_at")
    .eq("user_id", auth.profile.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.error) {
    return apiError("FEEDBACK_LOOKUP_FAILED", existing.error.message, 500, traceId);
  }
  if (existing.data) {
    return apiOk({ feedback: existing.data, duplicate: true }, traceId);
  }

  const created = await service
    .from("user_feedback")
    .insert({
      organization_id: auth.profile.organization_id,
      community_id: auth.profile.community_id,
      user_id: auth.profile.id,
      resident_id: residentId,
      category: parsed.data.category,
      content: parsed.data.content,
      contact_allowed: parsed.data.contactAllowed,
      page_path: parsed.data.pagePath ?? null,
      idempotency_key: idempotencyKey,
    })
    .select("id,status,created_at")
    .single();
  if (created.error || !created.data) {
    if (created.error?.code === "23505") {
      const duplicate = await service
        .from("user_feedback")
        .select("id,status,created_at")
        .eq("user_id", auth.profile.id)
        .eq("idempotency_key", idempotencyKey)
        .single();
      if (duplicate.data) return apiOk({ feedback: duplicate.data, duplicate: true }, traceId);
    }
    return apiError(
      "FEEDBACK_CREATE_FAILED",
      created.error?.message ?? "反馈提交失败。",
      500,
      traceId,
    );
  }

  await service.from("user_feedback_events").insert({
    feedback_id: created.data.id,
    actor_id: auth.profile.id,
    action: "submitted",
    from_status: null,
    to_status: "open",
    note: null,
  });

  const recipients = await service
    .from("profiles")
    .select("id,role,community_id")
    .eq("organization_id", auth.profile.organization_id)
    .eq("account_status", "active")
    .in("role", ["admin", "community"]);
  const recipientIds = (recipients.data ?? [])
    .filter(
      (item) =>
        item.role === "admin" ||
        !auth.profile?.community_id ||
        !item.community_id ||
        item.community_id === auth.profile.community_id,
    )
    .map((item) => item.id);
  if (recipientIds.length) {
    await service.from("notifications").insert(
      recipientIds.map((userId) => ({
        user_id: userId,
        actor_id: auth.profile!.id,
        type: "system",
        title: `收到${feedbackCategoryLabels[parsed.data.category]}反馈`,
        content: parsed.data.content.slice(0, 120),
        link_url: "/admin/feedback",
        metadata: {
          kind: "feedback_submission",
          feedbackId: created.data!.id,
          fromUserId: auth.profile!.id,
        },
      })),
    );
  }
  await service.from("notifications").insert({
    user_id: auth.profile.id,
    actor_id: auth.profile.id,
    type: "system",
    title: "反馈已收到",
    content: "工作人员会在管理后台查看；需要联系时仅使用您已授权的联系方式。",
    link_url: "/me",
    metadata: { kind: "feedback_receipt", feedbackId: created.data.id },
  });

  return apiOk({ feedback: created.data, duplicate: false }, traceId, 201);
}
