import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getPublishedContent } from "@/lib/db/carePlatform";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return apiError("CONTENT_NOT_CONFIGURED", "内容服务尚未配置。", 503, traceId);
  try {
    const items = await getPublishedContent({ supabase, communityId: request.nextUrl.searchParams.get("communityId"), category: request.nextUrl.searchParams.get("category"), limit: Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 30), 100) });
    return apiOk({ items }, traceId);
  } catch (error) {
    return apiError("CONTENT_FEED_FAILED", error instanceof Error ? error.message : "内容暂时无法读取。", 500, traceId);
  }
}
