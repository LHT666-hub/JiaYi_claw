import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { getHealthTimeline } from "@/lib/memory/healthTimeline";

const querySchema = z.object({
  resident_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  months: z.coerce.number().int().min(1).max(120).optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  const parsed = querySchema.safeParse({
    resident_id: request.nextUrl.searchParams.get("resident_id") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    months: request.nextUrl.searchParams.get("months") ?? undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_PARAMETER", "查询参数格式不正确。", 400, traceId);
  }

  try {
    const { residentId, selected } = await resolveCareSubject(
      request,
      profile,
      supabase,
      parsed.data.resident_id ?? null,
    );
    await assertVerifiedResidentCareBinding(residentId, supabase);

    const timeline = await getHealthTimeline(supabase, residentId, {
      limit: parsed.data.limit,
      months: parsed.data.months,
    });

    return apiOk({ residentId, careSubject: selected, timeline }, traceId);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const forbidden = verificationRequired || /FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message);
    return apiError(
      verificationRequired
        ? "CARE_BINDING_VERIFICATION_REQUIRED"
        : forbidden
          ? "RESIDENT_SCOPE_FORBIDDEN"
          : "HEALTH_TIMELINE_FAILED",
      verificationRequired
        ? "家医签约关系核验后才能读取健康轨迹。"
        : forbidden
          ? "无权读取该居民的健康轨迹。"
          : "健康轨迹读取失败，请稍后重试。",
      forbidden ? 403 : 500,
      traceId,
    );
  }
}
