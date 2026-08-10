import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { processOutboxEvents } from "@/lib/notifications/processOutbox";

export async function POST(request: Request) {
  const traceId = createTraceId();
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return apiError("WORKER_FORBIDDEN", "通知任务凭据无效。", 403, traceId);
  }
  try {
    return apiOk(await processOutboxEvents(25), traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OUTBOX_PROCESS_FAILED";
    return apiError(
      message === "WORKER_NOT_CONFIGURED" ? "WORKER_NOT_CONFIGURED" : "OUTBOX_CLAIM_FAILED",
      message === "WORKER_NOT_CONFIGURED" ? "通知任务尚未配置。" : "暂时无法领取通知任务。",
      message === "WORKER_NOT_CONFIGURED" ? 503 : 500,
      traceId,
    );
  }
}
