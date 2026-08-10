import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const entryInput = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  content: z.string().trim().min(10).max(10000),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30),
  sourceName: z.string().trim().min(2).max(160),
  sourceUrl: z.string().url(),
  effectiveFrom: z.string().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
});

async function requireAdmin(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  return auth.profile?.role === "admin" ? auth : null;
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireAdmin(request);
  if (!auth?.supabase) return apiError("FORBIDDEN", "只有管理员可以管理公开信息。", 403, traceId);
  const { data, error } = await auth.supabase.from("public_info_entries").select("*").order("updated_at", { ascending: false });
  return error ? apiError("PUBLIC_INFO_LIST_FAILED", error.message, 500, traceId) : apiOk({ items: data ?? [] }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "只有管理员可以管理公开信息。", 403, traceId);
  const parsed = entryInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_ENTRY", parsed.error.issues[0]?.message ?? "信息不完整。", 400, traceId);
  if (parsed.data.status === "published" && !parsed.data.expiresAt) {
    return apiError("EXPIRY_REQUIRED", "发布信息必须填写失效时间。", 400, traceId);
  }
  const { data, error } = await auth.supabase.from("public_info_entries").insert({
    organization_id: auth.profile.organization_id,
    community_id: auth.profile.community_id,
    title: parsed.data.title,
    category: parsed.data.category,
    content: parsed.data.content,
    keywords: parsed.data.keywords,
    source_name: parsed.data.sourceName,
    source_url: parsed.data.sourceUrl,
    effective_from: parsed.data.effectiveFrom ?? null,
    expires_at: parsed.data.expiresAt ?? null,
    verified_at: new Date().toISOString(),
    verified_by: auth.profile.id,
    status: parsed.data.status,
  }).select("*").single();
  return error ? apiError("PUBLIC_INFO_CREATE_FAILED", error.message, 500, traceId) : apiOk({ item: data }, traceId, 201);
}

export async function PATCH(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "只有管理员可以管理公开信息。", 403, traceId);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const parsed = entryInput.partial().safeParse(body);
  if (!id || !parsed.success) return apiError("INVALID_ENTRY", "信息编号或更新内容无效。", 400, traceId);
  if (parsed.data.status === "published" && !parsed.data.expiresAt) return apiError("EXPIRY_REQUIRED", "发布信息必须填写失效时间。", 400, traceId);
  const update = Object.fromEntries(Object.entries({ title: parsed.data.title, category: parsed.data.category, content: parsed.data.content, keywords: parsed.data.keywords, source_name: parsed.data.sourceName, source_url: parsed.data.sourceUrl, effective_from: parsed.data.effectiveFrom, expires_at: parsed.data.expiresAt, status: parsed.data.status, verified_at: new Date().toISOString(), verified_by: auth.profile.id }).filter(([, value]) => value !== undefined));
  const { data, error } = await auth.supabase.from("public_info_entries").update(update).eq("id", id).eq("organization_id", auth.profile.organization_id).select("*").maybeSingle();
  if (error) return apiError("PUBLIC_INFO_UPDATE_FAILED", error.message, 500, traceId);
  return data ? apiOk({ item: data }, traceId) : apiError("PUBLIC_INFO_NOT_FOUND", "信息不存在。", 404, traceId);
}

export async function DELETE(request: NextRequest) {
  const traceId = createTraceId(); const auth = await requireAdmin(request);
  if (!auth?.supabase || !auth.profile) return apiError("FORBIDDEN", "只有管理员可以下架公开信息。", 403, traceId);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return apiError("ENTRY_ID_REQUIRED", "缺少信息编号。", 400, traceId);
  const { data, error } = await auth.supabase.from("public_info_entries").update({ status: "expired", expires_at: new Date().toISOString() }).eq("id", id).eq("organization_id", auth.profile.organization_id).select("id").maybeSingle();
  if (error) return apiError("PUBLIC_INFO_UNPUBLISH_FAILED", error.message, 500, traceId);
  return data ? apiOk({ unpublished: true }, traceId) : apiError("PUBLIC_INFO_NOT_FOUND", "信息不存在。", 404, traceId);
}
