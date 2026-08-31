import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  // Only resident themselves or staff can reject candidates.
  const staffRoles = ["doctor", "nurse", "pharmacist", "community", "admin"];
  if (profile.role !== "resident" && !staffRoles.includes(profile.role)) {
    return apiError("CANDIDATE_REJECT_FORBIDDEN", "当前身份不能拒绝候选记忆。", 403, traceId);
  }

  const { id } = await context.params;

  try {
    const { data, error } = await supabase.rpc("reject_memory_candidate", {
      p_candidate_id: id,
    });

    if (error) {
      const message = error.message;
      if (message.includes("NOT_FOUND")) {
        return apiError("CANDIDATE_NOT_FOUND", "该候选记忆已经不存在。", 404, traceId);
      }
      if (message.includes("ALREADY_REVIEWED")) {
        return apiError("CANDIDATE_ALREADY_REVIEWED", "该候选记忆已被处理。", 409, traceId);
      }
      if (message.includes("FORBIDDEN")) {
        return apiError("CANDIDATE_REJECT_FORBIDDEN", "无权拒绝该候选记忆。", 403, traceId);
      }
      return apiError("CANDIDATE_REJECT_FAILED", error.message, 500, traceId);
    }

    if (!data) {
      return apiError("CANDIDATE_NOT_FOUND", "该候选记忆已经不存在。", 404, traceId);
    }

    return apiOk({ candidate: data }, traceId);
  } catch (error) {
    return apiError("CANDIDATE_REJECT_FAILED", readErrorMessage(error), 500, traceId);
  }
}
