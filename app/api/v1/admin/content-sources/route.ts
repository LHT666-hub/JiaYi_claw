import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/db/audit";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { adminShowcaseContent, demoMutation } from "@/lib/showcase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  sourceType: z.enum(["official_website", "rss", "wechat_article", "open_api", "manual"]),
  sourceUrl: z.string().url(),
  institutionId: z.string().uuid().nullable().optional(),
});
const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  active: z.boolean().optional(),
  institutionId: z.string().uuid().nullable().optional(),
}).refine((value) => value.name !== undefined || value.active !== undefined || value.institutionId !== undefined, {
  message: "没有需要更新的来源信息。",
});

async function contentStaff(request: NextRequest) { const auth = await getApiAuthContext(request); return auth.profile && ["admin", "community"].includes(auth.profile.role) ? auth : null; }

export async function GET(request: NextRequest) {
  const traceId = createTraceId(); const auth = await contentStaff(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth?.supabase) return apiOk(adminShowcaseContent, traceId);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "没有内容运营权限。", 403, traceId);
  const [sources, candidates, institutions] = await Promise.all([
    auth.supabase.from("content_sources").select("*,institution:institutions(name)").eq("organization_id", auth.profile.organization_id).order("created_at", { ascending: false }),
    auth.supabase.from("content_items").select("*,institution:institutions(name)").eq("organization_id", auth.profile.organization_id).in("status", ["candidate", "in_review"]).order("ingested_at", { ascending: false }).limit(100),
    auth.supabase.from("institutions").select("id,name,institution_type").eq("organization_id", auth.profile.organization_id).eq("status", "active").order("name"),
  ]);
  const error = sources.error ?? candidates.error ?? institutions.error;
  if (error) return apiError("CONTENT_SOURCE_LIST_FAILED", error.message, 500, traceId);
  const candidateIds = (candidates.data ?? []).map((item) => item.id);
  const revisions = candidateIds.length
    ? await auth.supabase.from("content_item_revisions").select("content_item_id,title,summary,published_at,status,captured_at").in("content_item_id", candidateIds).order("captured_at", { ascending: false })
    : { data: [], error: null };
  if (revisions.error) return apiError("CONTENT_REVISION_LIST_FAILED", revisions.error.message, 500, traceId);
  const previousByItem = new Map<string, Record<string, unknown>>();
  for (const revision of revisions.data ?? []) {
    if (!previousByItem.has(revision.content_item_id)) previousByItem.set(revision.content_item_id, revision);
  }
  const enrichedCandidates = (candidates.data ?? []).map((item) => ({ ...item, previous_revision: previousByItem.get(item.id) ?? null }));
  return apiOk({ sources: sources.data ?? [], candidates: enrichedCandidates, institutions: institutions.data ?? [] }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await contentStaff(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth?.supabase) return apiOk(demoMutation({ source: { id: crypto.randomUUID() } }), traceId, 201);
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
  if (error) return apiError("CONTENT_SOURCE_CREATE_FAILED", error.message, 500, traceId);
  await writeAuditLog({ actorId: auth.profile.id, action: "content_source.created", targetTable: "content_sources", targetId: data.id, detail: { traceId, sourceType: parsed.data.sourceType, host: sourceUrl.hostname }, supabase: auth.supabase });
  return apiOk({ source: data }, traceId, 201);
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId(); const auth = await contentStaff(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth?.supabase) return apiOk(demoMutation({ source: { id: crypto.randomUUID() } }), traceId);
  if (!auth?.supabase || auth.profile?.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以更新官方来源。", 403, traceId);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CONTENT_SOURCE_UPDATE", parsed.error.issues[0]?.message ?? "来源更新无效。", 400, traceId);
  if (parsed.data.institutionId) {
    const { data: institution } = await auth.supabase.from("institutions").select("id").eq("id", parsed.data.institutionId).eq("organization_id", auth.profile.organization_id).maybeSingle();
    if (!institution) return apiError("INSTITUTION_SCOPE_FORBIDDEN", "机构不属于当前组织。", 403, traceId);
  }
  const update = Object.fromEntries(Object.entries({ name: parsed.data.name, active: parsed.data.active, institution_id: parsed.data.institutionId }).filter(([, value]) => value !== undefined));
  const { data, error } = await auth.supabase.from("content_sources").update(update).eq("id", parsed.data.id).eq("organization_id", auth.profile.organization_id).select("*").maybeSingle();
  if (error) return apiError("CONTENT_SOURCE_UPDATE_FAILED", error.message, 500, traceId);
  if (!data) return apiError("CONTENT_SOURCE_NOT_FOUND", "来源不存在。", 404, traceId);
  const contentScopeUpdate = Object.fromEntries(Object.entries({
    institution_id: parsed.data.institutionId,
    source_name: parsed.data.name,
  }).filter(([, value]) => value !== undefined));
  if (Object.keys(contentScopeUpdate).length) {
    const { error: syncError } = await auth.supabase.from("content_items")
      .update(contentScopeUpdate)
      .eq("source_id", data.id)
      .eq("organization_id", auth.profile.organization_id);
    if (syncError) return apiError("CONTENT_SOURCE_SYNC_FAILED", syncError.message, 500, traceId);
  }
  await writeAuditLog({ actorId: auth.profile.id, action: parsed.data.active === false ? "content_source.disabled" : "content_source.updated", targetTable: "content_sources", targetId: data.id, detail: { traceId }, supabase: auth.supabase });
  return apiOk({ source: data }, traceId);
}
