import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { listStaffWorkQueue } from "@/lib/db/serviceRequests";
import { canAccessWorkbench, getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!canAccessWorkbench(profile.role)) return apiError("FORBIDDEN", "当前账号没有工作台权限。", 403, traceId);
  try {
    return apiOk({ requests: await listStaffWorkQueue(profile, supabase) }, traceId);
  } catch (error) {
    return apiError("WORK_QUEUE_FAILED", readErrorMessage(error), 500, traceId);
  }
}
