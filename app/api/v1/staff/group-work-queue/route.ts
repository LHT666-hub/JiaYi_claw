import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { canAccessWorkbench, getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !canAccessWorkbench(auth.profile.role)) return apiError("FORBIDDEN", "没有群运营权限。", 403, traceId);
  const { data, error } = await auth.supabase.from("resident_fact_candidates").select(`
    id,fact_type,structured_value,confidence,status,created_at,resident_id,
    resident:profiles(id,display_name,phone),
    source_message:channel_messages(id,safety_level,processing_status,created_at,channel_group:channel_groups(id,name))
  `).eq("organization_id", auth.profile.organization_id).eq("status", "pending").order("created_at").limit(100);
  return error ? apiError("GROUP_QUEUE_FAILED", error.message, 500, traceId) : apiOk({ candidates: data ?? [] }, traceId);
}
