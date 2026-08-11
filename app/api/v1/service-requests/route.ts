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
    const forbidden = verificationRequired || /FORBIDDEN|ROLE/.test(message);
    return apiError(
      verificationRequired ? "CARE_BINDING_VERIFICATION_REQUIRED" : forbidden ? "FORBIDDEN" : "SERVICE_REQUEST_CREATE_FAILED",
      verificationRequired ? "家医团队核验您的社区签约关系后，才能提交预约或转诊协助。" : message,
      forbidden ? 403 : 500,
      traceId,
    );
  }
}
