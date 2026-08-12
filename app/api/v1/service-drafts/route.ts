import { serviceDraftWriteSchema } from "@jiayi/contracts";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const deleteSchema = z.object({
  residentId: z.string().uuid().optional(),
  draftType: z.literal("appointment"),
});

function draftError(error: unknown, traceId: string) {
  const message = readErrorMessage(error);
  if (message.includes("DRAFT_CONSENT_REQUIRED")) {
    return apiError("DRAFT_CONSENT_REQUIRED", "保存预约草稿需要先开启敏感健康信息授权。", 403, traceId);
  }
  if (/DRAFT_RESIDENT_FORBIDDEN|RESIDENT_SCOPE_FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message)) {
    return apiError("DRAFT_RESIDENT_FORBIDDEN", "无权读取或保存该居民的草稿。", 403, traceId);
  }
  if (message.includes("CARE_BINDING_VERIFICATION_REQUIRED")) {
    return apiError("CARE_BINDING_VERIFICATION_REQUIRED", "家医签约关系核验后才能保存服务草稿。", 403, traceId);
  }
  return apiError("SERVICE_DRAFT_FAILED", "服务草稿暂时无法处理，请稍后重试。", 500, traceId);
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const subject = await resolveCareSubject(request, profile, supabase, request.nextUrl.searchParams.get("residentId"));
    await assertVerifiedResidentCareBinding(subject.residentId, supabase);
    const { data, error } = await supabase.rpc("load_service_draft", {
      p_resident_id: subject.residentId,
      p_draft_type: "appointment",
      p_policy_version: CURRENT_POLICY_VERSION,
    });
    if (error) throw error;
    return apiOk({ draft: data ?? null }, traceId);
  } catch (error) {
    return draftError(error, traceId);
  }
}

export async function PUT(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = serviceDraftWriteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_SERVICE_DRAFT", parsed.error.issues[0]?.message ?? "草稿内容不完整。", 400, traceId);
  try {
    const subject = await resolveCareSubject(request, profile, supabase, parsed.data.residentId ?? null);
    await assertVerifiedResidentCareBinding(subject.residentId, supabase);
    const { data, error } = await supabase.rpc("save_service_draft", {
      p_resident_id: subject.residentId,
      p_draft_type: parsed.data.draftType,
      p_payload: parsed.data.payload,
      p_policy_version: CURRENT_POLICY_VERSION,
    });
    if (error) throw error;
    return apiOk({ draft: data }, traceId);
  } catch (error) {
    return draftError(error, traceId);
  }
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_SERVICE_DRAFT", "草稿标识不正确。", 400, traceId);
  try {
    const subject = await resolveCareSubject(request, profile, supabase, parsed.data.residentId ?? null);
    const { data, error } = await supabase.rpc("delete_service_draft", {
      p_resident_id: subject.residentId,
      p_draft_type: parsed.data.draftType,
    });
    if (error) throw error;
    return apiOk({ deleted: Boolean(data) }, traceId);
  } catch (error) {
    return draftError(error, traceId);
  }
}
