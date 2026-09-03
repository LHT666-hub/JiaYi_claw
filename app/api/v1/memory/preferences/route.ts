import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { memoryShowcasePreferences, memoryShowcaseResident } from "@/lib/showcase/memory";

const querySchema = z.object({
  resident_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) {
    return apiOk({ ...memoryShowcaseResident, demo: true, preferences: memoryShowcasePreferences }, traceId);
  }
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  const parsed = querySchema.safeParse({
    resident_id: request.nextUrl.searchParams.get("resident_id") ?? undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_PARAMETER", "居民身份信息格式不正确。", 400, traceId);
  }

  try {
    const { residentId, selected } = await resolveCareSubject(
      request,
      profile,
      supabase,
      parsed.data.resident_id ?? null,
    );
    await assertVerifiedResidentCareBinding(residentId, supabase);

    const { data, error } = await supabase
      .from("resident_preferences")
      .select("id,preference_type,structured_value,source_type,source_ref,confirmation_status,status,valid_from,valid_to,last_verified_at,created_at,updated_at")
      .eq("resident_id", residentId)
      .eq("status", "active")
      .in("confirmation_status", ["user_confirmed", "staff_confirmed"])
      .order("created_at", { ascending: false });

    if (error) {
      return apiError("PREFERENCE_LIST_FAILED", error.message, 500, traceId);
    }

    return apiOk({
      residentId,
      careSubject: selected,
      preferences: data ?? [],
    }, traceId);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const forbidden = verificationRequired || /FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message);
    return apiError(
      verificationRequired
        ? "CARE_BINDING_VERIFICATION_REQUIRED"
        : forbidden
          ? "RESIDENT_SCOPE_FORBIDDEN"
          : "PREFERENCE_LIST_FAILED",
      verificationRequired
        ? "家医签约关系核验后才能读取偏好。"
        : forbidden
          ? "无权读取该居民的偏好信息。"
          : "偏好列表读取失败，请稍后重试。",
      forbidden ? 403 : 500,
      traceId,
    );
  }
}
