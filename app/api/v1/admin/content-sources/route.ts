import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  sourceType: z.enum(["official_website", "rss", "wechat_article", "open_api", "manual"]),
  sourceUrl: z.string().url(),
  institutionId: z.string().uuid().nullable().optional(),
});

async function contentStaff(request: NextRequest) { const auth = await getApiAuthContext(request); return auth.profile && ["admin", "community"].includes(auth.profile.role) ? auth : null; }

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await contentStaff(request);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "没有内容运营权限。", 403, traceId);
  const [sources, candidates] = await Promise.all([
    auth.supabase.from("content_sources").select("*,institution:institutions(name)").eq("organization_id", auth.profile.organization_id).order("created_at", { ascending: false }),
    auth.supabase.from("content_items").select("*,institution:institutions(name)").eq("organization_id", auth.profile.organization_id).in("status", ["candidate", "in_review"]).order("ingested_at", { ascending: false }).limit(100),
  ]);
  const error = sources.error ?? candidates.error;
  return error ? apiError("CONTENT_SOURCE_LIST_FAILED", error.message, 500, traceId) : apiOk({ sources: sources.data ?? [], candidates: candidates.data ?? [] }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await contentStaff(request);
  if (!auth?.supabase || !auth.profile?.organization_id) return apiError("FORBIDDEN", "只有管理员可以添加内容来源。", 403, traceId);
  if (auth.profile.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以添加官方来源。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CONTENT_SOURCE", parsed.error.issues[0]?.message ?? "来源信息无效。", 400, traceId);
  const sourceUrl = new URL(parsed.data.sourceUrl);
  if (sourceUrl.protocol !== "https:") return apiError("HTTPS_SOURCE_REQUIRED", "官方来源必须使用 HTTPS。", 400, traceId);
  if (parsed.data.institutionId) {
    const { data: institution } = await auth.supabase.from("institutions").select("id").eq("id", parsed.data.institutionId).eq("organization_id", auth.profile.organization_id).maybeSingle();
    if (!institution) return apiError("INSTITUTION_SCOPE_FORBIDDEN", "机构不属于当前组织。", 403, traceId);
  }
  const { data, error } = await auth.supabase.from("content_sources").insert({ organization_id: auth.profile.organization_id, community_id: auth.profile.community_id, institution_id: parsed.data.institutionId ?? null, name: parsed.data.name, source_type: parsed.data.sourceType, source_url: sourceUrl.toString(), allowed_host: sourceUrl.hostname.toLowerCase(), created_by: auth.profile.id }).select("*").single();
  return error ? apiError("CONTENT_SOURCE_CREATE_FAILED", error.message, 500, traceId) : apiOk({ source: data }, traceId, 201);
}
