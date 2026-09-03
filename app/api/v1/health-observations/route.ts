import { healthObservationSchema } from "@jiayi/contracts";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { demoMutation } from "@/lib/showcase/admin";

const demoObservations = [
  { id: "90000000-0000-4000-8000-000000000001", observation_type: "blood_pressure", value: 138, secondary_value: 86, unit: "mmHg", measured_at: new Date(Date.now() - 3_600_000).toISOString(), note: "晨起测量（演示）", source: "manual", can_delete: true },
  { id: "90000000-0000-4000-8000-000000000002", observation_type: "weight", value: 63.5, secondary_value: null, unit: "kg", measured_at: new Date(Date.now() - 86_400_000).toISOString(), note: null, source: "manual", can_delete: true },
];

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) return apiOk({ demo: true, residentId: "showcase-resident", careSubject: { displayName: "张阿姨", isSelf: true }, observations: demoObservations }, traceId);
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
      .select("id,recorded_by,observation_type,value,secondary_value,unit,measured_at,note,source,created_at")
      .eq("resident_id", residentId)
      .order("measured_at", { ascending: false })
      .limit(100);
    if (error) return apiError("HEALTH_OBSERVATION_LIST_FAILED", error.message, 500, traceId);
    const observations = (data ?? []).map(({ recorded_by: recordedBy, ...observation }) => ({
      ...observation,
      can_delete: observation.source === "manual"
        && (residentId === profile.id || recordedBy === profile.id),
    }));
    return apiOk({ residentId, careSubject: selected, observations }, traceId);
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
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) return apiOk(demoMutation({ observation: { id: crypto.randomUUID(), source: "manual", can_delete: true } }), traceId, 201);
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
      .select("id,observation_type,value,secondary_value,unit,measured_at,note,source,created_at")
      .single();
    if (error) throw error;
    return apiOk({ observation: { ...data, can_delete: true } }, traceId, 201);
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

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) return apiOk(demoMutation({ deleted: true }), traceId);
  if (!supabase || !profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_OBSERVATION", "健康记录信息不完整。", 400, traceId);

  const { data, error } = await supabase.rpc("delete_manual_health_observation", {
    p_observation_id: parsed.data.id,
  });
  if (!error && data)
    return apiOk({ deleted: true, id: parsed.data.id }, traceId);

  const message = error?.message ?? "";
  if (message.includes("NOT_FOUND"))
    return apiError("HEALTH_OBSERVATION_NOT_FOUND", "这条健康记录已经不存在。", 404, traceId);
  if (message.includes("IMMUTABLE"))
    return apiError("HEALTH_OBSERVATION_IMMUTABLE", "这条记录来自已确认来源，不能在居民端删除。", 409, traceId);
  if (message.includes("FORBIDDEN"))
    return apiError("HEALTH_OBSERVATION_FORBIDDEN", "您无权删除这条健康记录。", 403, traceId);
  return apiError("HEALTH_OBSERVATION_DELETE_FAILED", "暂时无法删除记录，请稍后重试。", 500, traceId);
}
