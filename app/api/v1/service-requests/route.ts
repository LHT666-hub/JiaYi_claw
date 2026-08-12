import { serviceRequestCreateSchema } from "@jiayi/contracts";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { createServiceRequest, listServiceRequests } from "@/lib/db/serviceRequests";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { processOutboxEvents } from "@/lib/notifications/processOutbox";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const careSubject = await resolveCareSubject(
      request,
      profile,
      supabase,
      request.nextUrl.searchParams.get("residentId"),
    );
    return apiOk({
      residentId: careSubject.residentId,
      careSubject: careSubject.selected,
      requests: await listServiceRequests(supabase, 50, careSubject.residentId),
    }, traceId);
  } catch (error) {
    return apiError("SERVICE_REQUEST_LIST_FAILED", readErrorMessage(error), 500, traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录后再提交服务申请。", 401, traceId);

  const parsed = serviceRequestCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "服务申请信息不完整。", 400, traceId);
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || crypto.randomUUID();
  try {
    const careSubject = await resolveCareSubject(
      request,
      profile,
      supabase,
      parsed.data.residentId ?? null,
    );
    await assertVerifiedResidentCareBinding(careSubject.residentId, supabase);
    const result = await createServiceRequest({
      input: { ...parsed.data, residentId: careSubject.residentId },
      idempotencyKey,
      profile,
      supabase,
      traceId,
    });
    await processOutboxEvents(10).catch(() => undefined);
    return apiOk(result, traceId, result.deduplicated ? 200 : 201);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const contentUnavailable = message.includes("CONTENT_SOURCE_NOT_AVAILABLE");
    const serviceUnavailable = message.includes("SERVICE_NOT_AVAILABLE") || message.includes("SERVICE_INFORMATION_ONLY");
    const forbidden = verificationRequired || /FORBIDDEN|ROLE/.test(message);
    return apiError(
      verificationRequired ? "CARE_BINDING_VERIFICATION_REQUIRED" : contentUnavailable ? "CONTENT_SOURCE_NOT_AVAILABLE" : serviceUnavailable ? "SERVICE_NOT_AVAILABLE" : forbidden ? "FORBIDDEN" : "SERVICE_REQUEST_CREATE_FAILED",
      verificationRequired ? "家医团队核验您的社区签约关系后，才能提交预约或转诊协助。" : contentUnavailable ? "关联内容已过期、下架或不属于当前社区，请返回服务页重新确认。" : serviceUnavailable ? "所属社区暂未开放这项人工办理服务，请返回服务页查看当前可用项目。" : message,
      contentUnavailable || serviceUnavailable ? 409 : forbidden ? 403 : 500,
      traceId,
    );
  }
}
