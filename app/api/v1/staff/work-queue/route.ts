import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { listStaffWorkQueue } from "@/lib/db/serviceRequests";
import { canAccessWorkbench, getApiAuthContext } from "@/lib/supabase/server-auth";
import { presentQueueItem, summarizeQueue } from "@/lib/workbench/queuePresentation";
import { staffShowcaseQueue } from "@/lib/showcase/staff";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return apiOk(staffShowcaseQueue, traceId);
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }
  if (!canAccessWorkbench(profile.role)) return apiError("FORBIDDEN", "当前账号没有工作台权限。", 403, traceId);
  try {
    const requests = await listStaffWorkQueue(profile, supabase);
    const { data: catalog } = await supabase
      .from("service_catalog")
      .select("service_type,response_sla_hours")
      .eq("organization_id", profile.organization_id)
      .eq("active", true);
    const slaByType = new Map((catalog ?? []).map((item) => [item.service_type, item.response_sla_hours ?? 8]));
    const presented = requests.map((item) => ({
      ...item,
      presentation: presentQueueItem(item as Parameters<typeof presentQueueItem>[0], slaByType.get(item.service_type) ?? 8),
    })).sort((a, b) => b.presentation.attentionScore - a.presentation.attentionScore);
    return apiOk({
      profile: { id: profile.id, role: profile.role, displayName: profile.display_name },
      summary: summarizeQueue(presented),
      requests: presented,
    }, traceId);
  } catch (error) {
    return apiError("WORK_QUEUE_FAILED", readErrorMessage(error), 500, traceId);
  }
}
