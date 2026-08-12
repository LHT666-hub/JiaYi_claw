import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const serviceRequestId = request.nextUrl.searchParams.get("serviceRequestId");
    if (serviceRequestId && !z.string().uuid().safeParse(serviceRequestId).success) {
      return apiError("INVALID_SERVICE_REQUEST_ID", "服务申请编号格式不正确。", 400, traceId);
    }
    let query = supabase
      .from("clinical_briefs")
      .select("*")
      .eq("resident_id", (await context.params).id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (serviceRequestId) query = query.eq("service_request_id", serviceRequestId);
    const { data, error } = await query;
    if (error) throw error;
    return apiOk({ briefs: data ?? [] }, traceId);
  } catch (error) {
    return apiError("CLINICAL_BRIEF_FAILED", readErrorMessage(error), 500, traceId);
  }
}
