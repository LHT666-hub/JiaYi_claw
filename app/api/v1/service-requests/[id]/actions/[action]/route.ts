import { serviceRequestActionSchema } from "@jiayi/contracts";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { actionServiceRequest } from "@/lib/db/serviceRequests";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { processOutboxEvents } from "@/lib/notifications/processOutbox";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const params = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = serviceRequestActionSchema.safeParse({ ...body, action: params.action });
  if (!parsed.success) return apiError("INVALID_ACTION", "不支持这个处理动作。", 400, traceId);
  try {
    const item = await actionServiceRequest({ id: params.id, input: parsed.data, supabase });
    await processOutboxEvents(10).catch(() => undefined);
    return apiOk({ request: item }, traceId);
  } catch (error) {
    const message = readErrorMessage(error);
    const forbidden = /FORBIDDEN|UNAUTHENTICATED/.test(message);
    const invalid = /INVALID_SERVICE_TRANSITION/.test(message);
    const assignedToOther = /SERVICE_ASSIGNED_TO_OTHER/.test(message);
    return apiError(
      forbidden ? "FORBIDDEN" : assignedToOther ? "ALREADY_ASSIGNED" : invalid ? "INVALID_TRANSITION" : "SERVICE_ACTION_FAILED",
      assignedToOther ? "该申请已由其他工作人员认领，请刷新队列。" : invalid ? "当前状态不能执行这个操作，请刷新进度后重试。" : message,
      forbidden ? 403 : assignedToOther || invalid ? 409 : 500,
      traceId,
    );
  }
}
