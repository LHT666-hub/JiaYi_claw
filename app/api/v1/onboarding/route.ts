import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const onboardingSchema = z.object({
  displayName: z.string().trim().min(2, "请填写至少 2 个字的称呼。 ").max(40),
  role: z.enum(["resident", "family"]),
  communityId: z.string().uuid(),
  consents: z.object({
    privacy: z.literal(true),
    sensitive_health: z.boolean(),
    ai_processing: z.boolean(),
    notification: z.boolean(),
  }),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先完成手机号验证。", 401, traceId);

  const [communities, consents] = await Promise.all([
    supabase
      .from("communities")
      .select("id,name,district,address,service_phone,organization_id")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("consents")
      .select("scope,granted,policy_version")
      .eq("user_id", profile.id)
      .eq("resident_id", profile.id)
      .eq("policy_version", CURRENT_POLICY_VERSION),
  ]);

  const error = communities.error ?? consents.error;
  if (error) return apiError("ONBOARDING_LOAD_FAILED", "首次建档信息暂时无法加载。", 500, traceId);

  return apiOk({
    profile,
    communities: communities.data ?? [],
    consents: consents.data ?? [],
    policyVersion: CURRENT_POLICY_VERSION,
  }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "登录状态已失效，请重新验证手机号。", 401, traceId);
  if (!["resident", "family"].includes(profile.role)) {
    return apiError("PUBLIC_ONBOARDING_FORBIDDEN", "工作人员账号须通过机构邀请开通。", 403, traceId);
  }

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_ONBOARDING", parsed.error.issues[0]?.message ?? "请检查首次建档信息。", 400, traceId);
  }

  const { data, error } = await supabase.rpc("complete_public_onboarding", {
    p_display_name: parsed.data.displayName,
    p_role: parsed.data.role,
    p_community_id: parsed.data.communityId,
    p_policy_version: CURRENT_POLICY_VERSION,
    p_consents: parsed.data.consents,
  });

  if (error) {
    const message = error.message.includes("COMMUNITY_NOT_AVAILABLE")
      ? "所选社区暂未开放服务。"
      : error.message.includes("PRIVACY_CONSENT_REQUIRED")
        ? "请先同意隐私政策与账号服务。"
        : "首次建档没有保存成功，请稍后重试。";
    return apiError("ONBOARDING_SAVE_FAILED", message, 400, traceId);
  }

  return apiOk({
    profile: data,
    nextPath: parsed.data.role === "family" ? "/family-link" : "/",
  }, traceId);
}
