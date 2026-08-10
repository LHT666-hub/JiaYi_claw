import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const consentInput = z.object({
  residentId: z.string().uuid().nullable().optional(),
  scope: z.enum([
    "privacy",
    "sensitive_health",
    "family_delegate",
    "ai_processing",
    "notification",
  ]),
  policyVersion: z.string().trim().min(1).max(40),
  granted: z.boolean(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!["resident", "family"].includes(profile.role)) {
    return apiError(
      "CONSENT_ROLE_FORBIDDEN",
      "工作人员账号不使用居民授权设置。",
      403,
      traceId,
    );
  }
  try {
    const subject = await resolveCareSubject(
      request,
      profile,
      supabase,
      request.nextUrl.searchParams.get("residentId"),
    );
    const { data, error } = await supabase
      .from("consents")
      .select("*")
      .eq("user_id", profile.id)
      .eq("resident_id", subject.residentId)
      .order("created_at", { ascending: false });
    return error
      ? apiError("CONSENT_LIST_FAILED", error.message, 500, traceId)
      : apiOk(
          {
            residentId: subject.residentId,
            careSubject: subject.selected,
            consents: data ?? [],
          },
          traceId,
        );
  } catch {
    return apiError(
      "CONSENT_SCOPE_FORBIDDEN",
      "无法读取当前服务对象的授权。",
      403,
      traceId,
    );
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = consentInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_CONSENT", "授权信息不完整。", 400, traceId);
  const residentId =
    profile.role === "resident" ? profile.id : parsed.data.residentId;
  if (!residentId)
    return apiError(
      "RESIDENT_REQUIRED",
      "家属授权必须指定已绑定居民。",
      400,
      traceId,
    );
  if (profile.role === "family") {
    const { data: binding } = await supabase
      .from("family_bindings")
      .select("id")
      .eq("family_id", profile.id)
      .eq("resident_id", residentId)
      .eq("status", "active")
      .maybeSingle();
    if (!binding)
      return apiError(
        "RESIDENT_SCOPE_FORBIDDEN",
        "无权修改该居民的授权。",
        403,
        traceId,
      );
  } else if (profile.role !== "resident") {
    return apiError(
      "CONSENT_ROLE_FORBIDDEN",
      "工作人员不能代替居民授予授权。",
      403,
      traceId,
    );
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("consents")
    .upsert(
      {
        user_id: profile.id,
        resident_id: residentId,
        scope: parsed.data.scope,
        policy_version: parsed.data.policyVersion,
        granted: parsed.data.granted,
        granted_at: parsed.data.granted ? now : null,
        revoked_at: parsed.data.granted ? null : now,
      },
      { onConflict: "user_id,resident_id,scope,policy_version" },
    )
    .select("*")
    .single();
  return error
    ? apiError("CONSENT_SAVE_FAILED", error.message, 500, traceId)
    : apiOk({ consent: data }, traceId);
}
