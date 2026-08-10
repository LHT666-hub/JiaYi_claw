import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getServiceRequest } from "@/lib/db/serviceRequests";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const item = await getServiceRequest((await context.params).id, supabase);
    return item ? apiOk({ request: item }, traceId) : apiError("NOT_FOUND", "没有找到这条服务申请。", 404, traceId);
  } catch (error) {
    return apiError("SERVICE_REQUEST_READ_FAILED", readErrorMessage(error), 500, traceId);
  }
}
