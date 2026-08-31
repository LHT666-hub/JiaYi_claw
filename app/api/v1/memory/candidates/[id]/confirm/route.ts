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

  // Resident can confirm their own candidates; staff can confirm through RPC's own role check.
  if (profile.role === "family") {
    return apiError("CANDIDATE_CONFIRM_FORBIDDEN", "家属账号不能确认候选记忆。", 403, traceId);
  }

  const { id } = await context.params;

  try {
    const { data, error } = await supabase.rpc("confirm_memory_candidate", {
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
        return apiError("CANDIDATE_CONFIRM_FORBIDDEN", "无权确认该候选记忆。", 403, traceId);
      }
      return apiError("CANDIDATE_CONFIRM_FAILED", error.message, 500, traceId);
    }

    if (!data) {
      return apiError("CANDIDATE_NOT_FOUND", "该候选记忆已经不存在。", 404, traceId);
    }

    return apiOk({ candidate: data }, traceId);
  } catch (error) {
    return apiError("CANDIDATE_CONFIRM_FAILED", readErrorMessage(error), 500, traceId);
  }
}
