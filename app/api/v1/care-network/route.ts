import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getCareNetworkForResident, resolveResidentScope } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const residentId = await resolveResidentScope(profile, supabase, request.nextUrl.searchParams.get("residentId"));
    const network = await getCareNetworkForResident(residentId, supabase);
    return network ? apiOk({ residentId, network }, traceId) : apiError("CARE_NETWORK_NOT_BOUND", "尚未绑定家医服务网络，请联系社区工作人员。", 404, traceId);
  } catch (error) {
    return apiError("CARE_NETWORK_LOAD_FAILED", error instanceof Error ? error.message : "读取失败。", 500, traceId);
  }
}
