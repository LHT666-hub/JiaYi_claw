import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const { data, error } = await supabase
      .from("clinical_briefs")
      .select("*")
      .eq("resident_id", (await context.params).id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return apiOk({ briefs: data ?? [] }, traceId);
  } catch (error) {
    return apiError("CLINICAL_BRIEF_FAILED", readErrorMessage(error), 500, traceId);
  }
}
