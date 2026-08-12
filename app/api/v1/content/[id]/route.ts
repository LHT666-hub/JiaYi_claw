import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId(); const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiError("INVALID_CONTENT", "内容编号无效。", 400, traceId);
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return apiError("CONTENT_NOT_CONFIGURED", "内容服务尚未配置。", 503, traceId);
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("content_items")
    .select("id,category,title,summary,cover_url,original_url,source_name,published_at,effective_from,expires_at,reviewed_at,institution:institutions(name)")
    .eq("id", id)
    .eq("status", "published")
    .or(`effective_from.is.null,effective_from.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();
  if (error) return apiError("CONTENT_LOAD_FAILED", error.message, 500, traceId);
  return data ? apiOk({ item: data }, traceId) : apiError("CONTENT_NOT_FOUND", "内容不存在或尚未审核发布。", 404, traceId);
}
