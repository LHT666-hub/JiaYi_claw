import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { CARE_SUBJECT_COOKIE, resolveCareSubject } from "@/lib/careSubjects";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const selectSchema = z.object({ residentId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!['resident', 'family'].includes(auth.profile.role)) {
    return apiError("CARE_SUBJECT_NOT_AVAILABLE", "当前工作身份不使用居民服务对象切换。", 403, traceId);
  }
  try {
    const result = await resolveCareSubject(request, auth.profile, auth.supabase);
    return apiOk(result, traceId);
  } catch (error) {
    const message = readErrorMessage(error);
    const missing = message === "BOUND_RESIDENT_REQUIRED";
    return apiError(
      missing ? "BOUND_RESIDENT_REQUIRED" : "CARE_SUBJECT_LOAD_FAILED",
      missing ? "请先完成居民本人授权。" : "服务对象暂时无法读取。",
      missing ? 409 : 500,
      traceId,
    );
  }
}

export async function PUT(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  const parsed = selectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CARE_SUBJECT", "请选择有效的服务对象。", 400, traceId);
  try {
    const result = await resolveCareSubject(
      request,
      auth.profile,
      auth.supabase,
      parsed.data.residentId,
    );
    const response = apiOk(result, traceId);
    response.cookies.set(CARE_SUBJECT_COOKIE, result.residentId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return apiError("CARE_SUBJECT_FORBIDDEN", "您没有为该居民办理服务的授权。", 403, traceId);
  }
}
