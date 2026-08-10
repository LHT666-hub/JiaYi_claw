import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return apiError("UNAUTHORIZED", "无权执行注销任务。", 401, traceId);
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return apiError("SERVICE_NOT_CONFIGURED", "服务端数据库尚未配置。", 503, traceId);

  const { data: due, error } = await supabase.from("account_deletion_requests").select("id")
    .in("status", ["pending", "failed"]).lte("scheduled_for", new Date().toISOString()).order("scheduled_for").limit(20);
  if (error) return apiError("DELETION_QUEUE_FAILED", "无法读取注销任务。", 500, traceId);

  let completed = 0; let failed = 0;
  for (const item of due ?? []) {
    const { data: userId, error: beginError } = await supabase.rpc("begin_due_account_deletion", { p_request_id: item.id });
    if (beginError || !userId) {
      failed += 1;
      await supabase.from("account_deletion_requests").update({ status: "failed", processor_note: "ANONYMIZATION_FAILED", updated_at: new Date().toISOString() }).eq("id", item.id);
      continue;
    }
    const { error: authError } = await supabase.auth.admin.deleteUser(String(userId), true);
    if (authError) {
      failed += 1;
      await supabase.from("account_deletion_requests").update({ status: "failed", processor_note: "AUTH_DELETION_FAILED", updated_at: new Date().toISOString() }).eq("id", item.id);
      continue;
    }
    completed += 1;
    await supabase.from("account_deletion_requests").update({ status: "completed", processed_at: new Date().toISOString(), processor_note: null, updated_at: new Date().toISOString() }).eq("id", item.id);
  }
  return apiOk({ claimed: due?.length ?? 0, completed, failed }, traceId);
}
