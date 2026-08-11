import { healthObservationSchema } from "@jiayi/contracts";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const { residentId, selected } = await resolveCareSubject(
      request,
      profile,
      supabase,
      request.nextUrl.searchParams.get("residentId"),
    );
    await assertVerifiedResidentCareBinding(residentId, supabase);
    const { data, error } = await supabase
      .from("health_observations")
      .select("*")
      .eq("resident_id", residentId)
      .order("measured_at", { ascending: false })
      .limit(100);
    return error
      ? apiError("HEALTH_OBSERVATION_LIST_FAILED", error.message, 500, traceId)
      : apiOk({ residentId, careSubject: selected, observations: data ?? [] }, traceId);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const forbidden = verificationRequired || /FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message);
    return apiError(
      verificationRequired ? "CARE_BINDING_VERIFICATION_REQUIRED" : forbidden ? "RESIDENT_SCOPE_FORBIDDEN" : "HEALTH_OBSERVATION_LIST_FAILED",
      verificationRequired ? "家医签约关系核验后才能读取健康记录。" : forbidden ? "请先绑定需要协助的居民。" : message,
      forbidden ? 403 : 500,
      traceId,
    );
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const body = await request.json().catch(() => null);
  const parsed = healthObservationSchema.safeParse(body?.observation ?? body);
  if (!parsed.success) return apiError("INVALID_OBSERVATION", "健康记录格式不正确。", 400, traceId);
  try {
    const { residentId } = await resolveCareSubject(
      request,
      profile,
      supabase,
      typeof body?.residentId === "string" ? body.residentId : null,
    );
    await assertVerifiedResidentCareBinding(residentId, supabase);
    const { data, error } = await supabase
      .from("health_observations")
      .insert({
        resident_id: residentId,
        recorded_by: profile.id,
        observation_type: parsed.data.type,
        value: parsed.data.value,
        secondary_value: parsed.data.secondaryValue,
        unit: parsed.data.unit,
        measured_at: parsed.data.measuredAt,
        note: parsed.data.note,
        source: "manual",
      })
      .select("*")
      .single();
    if (error) throw error;
    return apiOk({ observation: data }, traceId, 201);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const forbidden = verificationRequired || /FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message);
    return apiError(
      verificationRequired ? "CARE_BINDING_VERIFICATION_REQUIRED" : forbidden ? "RESIDENT_SCOPE_FORBIDDEN" : "HEALTH_OBSERVATION_CREATE_FAILED",
      verificationRequired ? "家医签约关系核验后才能保存健康记录。" : forbidden ? "无权为该居民添加健康记录。" : message,
      forbidden ? 403 : 500,
      traceId,
    );
  }
}
