import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const MEMORY_TYPES = [
  "symptom_report",
  "medication_statement",
  "daily_living",
  "care_preference",
  "health_experience",
  "allergy_self_reported",
  "lifestyle",
] as const;

const querySchema = z.object({
  resident_id: z.string().uuid().optional(),
  memory_type: z.enum(MEMORY_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  const parsed = querySchema.safeParse({
    resident_id: request.nextUrl.searchParams.get("resident_id") ?? undefined,
    memory_type: request.nextUrl.searchParams.get("memory_type") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
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

    let query = supabase
      .from("resident_memories")
      .select("id,memory_type,content,confidence,evidence_level,occurred_at,valid_from,valid_to,last_verified_at,confirmation_status,created_at,updated_at")
      .eq("resident_id", residentId)
      .eq("is_active", true)
      .in("confirmation_status", ["user_confirmed", "staff_confirmed"])
      .order("confidence", { ascending: false, nullsFirst: false })
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(parsed.data.limit ?? 50);

    if (parsed.data.memory_type) {
      query = query.eq("memory_type", parsed.data.memory_type);
    }

    const { data, error } = await query;
    if (error) {
      return apiError("MEMORY_LIST_FAILED", error.message, 500, traceId);
    }

    return apiOk({
      residentId,
      careSubject: selected,
      memories: data ?? [],
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
          : "MEMORY_LIST_FAILED",
      verificationRequired
        ? "家医签约关系核验后才能读取记忆。"
        : forbidden
          ? "无权读取该居民的记忆信息。"
          : "记忆列表读取失败，请稍后重试。",
      forbidden ? 403 : 500,
      traceId,
    );
  }
}
