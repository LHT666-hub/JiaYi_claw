import { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      return apiOk({ items: [], demo: true, retentionEnabled: true }, traceId);
    }
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }
  if (process.env.ASSISTANT_TRANSCRIPT_RETENTION !== "true") {
    return apiOk({ items: [], demo: false, retentionEnabled: false }, traceId);
  }
  const { data, error } = await auth.supabase
    .from("ask_logs")
    .select("id, question, answer, source, category, risk_level, suggest_doctor, created_at")
    .eq("user_id", auth.profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return error
    ? apiError("ASSISTANT_HISTORY_FAILED", "对话记录读取失败。", 500, traceId)
    : apiOk({ items: data ?? [], demo: false, retentionEnabled: true }, traceId);
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return apiOk({ cleared: true, demo: true }, traceId);
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }
  const { error } = await auth.supabase.from("ask_logs").delete().eq("user_id", auth.profile.id);
  return error
    ? apiError("ASSISTANT_HISTORY_CLEAR_FAILED", "对话记录清除失败。", 500, traceId)
    : apiOk({ cleared: true }, traceId);
}
