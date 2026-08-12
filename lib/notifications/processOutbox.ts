import { z } from "zod";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { deliverWechatServiceUpdate } from "@/lib/notifications/wechatSubscription";

const payloadSchema = z.object({
  requestId: z.string().uuid(),
  status: z.string().min(1).max(60),
  note: z.string().nullable().optional(),
});

export type OutboxProcessResult = {
  claimed: number;
  sent: number;
  failed: number;
  deadLetter: number;
};

function statusLabel(status: string) {
  return serviceStatusLabels[status as keyof typeof serviceStatusLabels] ?? status;
}

export async function processOutboxEvents(limit = 25): Promise<OutboxProcessResult> {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) throw new Error("WORKER_NOT_CONFIGURED");
  const { data: events, error } = await supabase.rpc("claim_outbox_events", {
    p_limit: Math.max(1, Math.min(limit, 100)),
  });
  if (error) throw new Error("OUTBOX_CLAIM_FAILED");

  let sent = 0;
  let failed = 0;
  let deadLetter = 0;
  for (const event of events ?? []) {
    try {
      const payload = payloadSchema.parse(event.payload);
      if (!event.recipient_id) throw new Error("RECIPIENT_MISSING");

      const { data: existing, error: existingError } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", event.recipient_id)
        .eq("metadata->>outboxEventId", event.id)
        .maybeSingle();
      if (existingError) throw existingError;

      if (!existing) {
        const label = statusLabel(payload.status);
        const { error: notificationError } = await supabase.from("notifications").insert({
          user_id: event.recipient_id,
          type: "system",
          title: payload.status === "submitted" ? "服务申请已提交" : `服务进度：${label}`,
          content: payload.note?.trim() || `您的服务申请状态已更新为：${label}`,
          link_url: `/service-requests/${payload.requestId}`,
          metadata: {
            requestId: payload.requestId,
            status: payload.status,
            outboxEventId: event.id,
          },
        });
        if (notificationError) throw notificationError;
      }

      const label = statusLabel(payload.status);
      const wechat = await deliverWechatServiceUpdate({
        supabase,
        recipientId: event.recipient_id,
        requestId: payload.requestId,
        title: "家医服务进度",
        status: label,
        note: payload.note?.trim() || `服务状态已更新为：${label}`,
        updatedAt: new Date().toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false,
        }),
      });

      const { error: sentError } = await supabase
        .from("outbox_events")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          delivery_results: { inApp: "sent", wechat },
        })
        .eq("id", event.id);
      if (sentError) throw sentError;
      sent += 1;
    } catch (eventError) {
      const isDead = Number(event.attempts) >= 5;
      await supabase
        .from("outbox_events")
        .update({
          status: isDead ? "dead_letter" : "failed",
          next_attempt_at: new Date(
            Date.now() + Math.min(60, 2 ** Number(event.attempts)) * 60_000,
          ).toISOString(),
          last_error: (eventError instanceof Error
            ? eventError.message
            : JSON.stringify(eventError) || "DELIVERY_FAILED").slice(0, 200),
        })
        .eq("id", event.id);
      if (isDead) deadLetter += 1;
      else failed += 1;
    }
  }

  return { claimed: events?.length ?? 0, sent, failed, deadLetter };
}
