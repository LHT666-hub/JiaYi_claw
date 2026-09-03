import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { memoryShowcasePreferences } from "@/lib/showcase/memory";

const updateSchema = z.object({
  structured_value: z.unknown().refine(
    (value) => value !== null && value !== undefined,
    { message: "structured_value 不能为空" },
  ),
});

const STAFF_ROLES = ["doctor", "nurse", "pharmacist", "community", "admin"] as const;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const current = memoryShowcasePreferences.find((item) => item.id === id) ?? memoryShowcasePreferences[0];
    return apiOk({ demo: true, simulated: true, preference: { ...current, id, structured_value: body?.structured_value ?? current.structured_value, updated_at: new Date().toISOString() } }, traceId);
  }
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_PREFERENCE", "偏好信息格式不正确。", 400, traceId);
  }

  const { id } = await context.params;
  const isStaff = STAFF_ROLES.includes(profile.role as typeof STAFF_ROLES[number]);

  // Only resident themselves or staff can update preferences.
  if (profile.role !== "resident" && !isStaff) {
    return apiError("PREFERENCE_UPDATE_FORBIDDEN", "当前身份不能更新偏好。", 403, traceId);
  }

  try {
    // Use the security-definer RPC — it handles permission checks,
    // superseding, and audit logging internally.
    const { data: newPreference, error } = await supabase.rpc("update_preference", {
      p_preference_id: id,
      p_structured_value: parsed.data.structured_value as Record<string, unknown>,
    });

    if (error) {
      const message = error.message;
      if (message.includes("NOT_FOUND")) {
        return apiError("PREFERENCE_NOT_FOUND", "这条偏好已经不存在。", 404, traceId);
      }
      if (message.includes("FORBIDDEN")) {
        return apiError("PREFERENCE_UPDATE_FORBIDDEN", "无权更新该居民的偏好。", 403, traceId);
      }
      return apiError("PREFERENCE_UPDATE_FAILED", error.message, 500, traceId);
    }

    if (!newPreference) {
      return apiError("PREFERENCE_NOT_FOUND", "这条偏好已经不存在。", 404, traceId);
    }

    return apiOk({ preference: newPreference }, traceId);
  } catch (error) {
    return apiError("PREFERENCE_UPDATE_FAILED", readErrorMessage(error), 500, traceId);
  }
}
