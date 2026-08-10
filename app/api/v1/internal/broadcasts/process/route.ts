import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const traceId = createTraceId();
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return apiError("WORKER_FORBIDDEN", "任务凭据无效。", 403, traceId);
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return apiError("WORKER_NOT_CONFIGURED", "任务服务尚未配置。", 503, traceId);
  const { data: jobs, error } = await supabase.from("scheduled_broadcasts").select("*").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(20);
  if (error) return apiError("BROADCAST_CLAIM_FAILED", "暂时无法读取通知任务。", 500, traceId);
  const webhook = process.env.WECOM_GROUP_WEBHOOK_URL;
  let sent = 0; let failed = 0;
  for (const job of jobs ?? []) {
    const { data: claimed } = await supabase.from("scheduled_broadcasts").update({ status: "sending" }).eq("id", job.id).eq("status", "scheduled").select("id").maybeSingle();
    if (!claimed) continue;
    try {
      if (!webhook) throw new Error("WECOM_WEBHOOK_NOT_CONFIGURED");
      const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msgtype: "text", text: { content: `${job.title}\n${job.body}${job.link_url ? `\n${job.link_url}` : ""}` } }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`WECOM_HTTP_${response.status}`);
      const result = await response.json() as { errcode?: number; errmsg?: string };
      if (result.errcode) throw new Error(`WECOM_${result.errcode}`);
      await supabase.from("scheduled_broadcasts").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", job.id); sent += 1;
    } catch (eventError) {
      await supabase.from("scheduled_broadcasts").update({ status: "failed", last_error: eventError instanceof Error ? eventError.message.slice(0, 200) : "SEND_FAILED" }).eq("id", job.id); failed += 1;
    }
  }
  const { data: purged } = await supabase.rpc("purge_expired_channel_messages");
  return apiOk({ claimed: jobs?.length ?? 0, sent, failed, purgedMessages: purged ?? 0 }, traceId);
}
