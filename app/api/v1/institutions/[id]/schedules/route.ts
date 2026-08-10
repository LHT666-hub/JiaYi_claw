import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getVerifiedSchedules } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiError("INVALID_INSTITUTION", "机构编号无效。", 400, traceId);
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile) return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  try {
    const schedules = await getVerifiedSchedules({ supabase, institutionIds: [id], from: request.nextUrl.searchParams.get("from") ?? undefined, to: request.nextUrl.searchParams.get("to") ?? undefined, limit: 100 });
    return apiOk({ schedules }, traceId);
  } catch (error) {
    return apiError("SCHEDULE_LOAD_FAILED", error instanceof Error ? error.message : "排班暂时无法读取。", 500, traceId);
  }
}
