import { createHash } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { assertSafeOfficialUrl } from "@/lib/security/safeUrl";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({ sourceId: z.string().uuid(), url: z.string().url(), category: z.enum(["notice", "activity", "health_classroom", "schedule_notice", "policy"]) });

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || auth.profile?.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以采集内容。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INGEST_REQUEST", "采集参数无效。", 400, traceId);
  const { data: source } = await auth.supabase.from("content_sources").select("*").eq("id", parsed.data.sourceId).eq("organization_id", auth.profile.organization_id).eq("active", true).maybeSingle();
  if (!source) return apiError("CONTENT_SOURCE_NOT_FOUND", "来源不存在或已停用。", 404, traceId);
  let jobId: string | null = null;
  try {
    const target = await assertSafeOfficialUrl(parsed.data.url, source.allowed_host);
    const { data: job } = await auth.supabase.from("ingestion_jobs").insert({ source_id: source.id, requested_by: auth.profile.id, target_url: target.toString(), status: "processing", started_at: new Date().toISOString() }).select("id").single();
    jobId = job?.id ?? null;
    const response = await fetch(target, { headers: { "User-Agent": "JiayiClawContentReview/1.0" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error("SOURCE_DOCUMENT_TOO_LARGE");
    const $ = load(html);
    const meta = (property: string) => $(`meta[property='${property}']`).attr("content")?.trim() || $(`meta[name='${property}']`).attr("content")?.trim() || "";
    const title = (meta("og:title") || $("title").first().text()).trim().slice(0, 200);
    const summary = (meta("og:description") || meta("description")).replace(/\s+/g, " ").trim().slice(0, 800);
    if (!title || summary.length < 10) throw new Error("SOURCE_METADATA_INCOMPLETE");
    const cover = meta("og:image");
    const hash = createHash("sha256").update(`${target}\n${title}\n${summary}`).digest("hex");
    const { data, error } = await auth.supabase.from("content_items").upsert({ organization_id: auth.profile.organization_id, community_id: source.community_id, institution_id: source.institution_id, source_id: source.id, category: parsed.data.category, title, summary, cover_url: cover && /^https:\/\//.test(cover) ? cover : null, original_url: target.toString(), source_name: source.name, published_at: meta("article:published_time") || null, status: "candidate", ingestion_method: "url_import", content_hash: hash }).select("*").single();
    if (error) throw error;
    if (jobId) await auth.supabase.from("ingestion_jobs").update({ status: "completed", items_found: 1, completed_at: new Date().toISOString() }).eq("id", jobId);
    await auth.supabase.from("content_sources").update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
    return apiOk({ item: data, requiresReview: true }, traceId, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "INGEST_FAILED";
    if (jobId) await auth.supabase.from("ingestion_jobs").update({ status: "failed", last_error: message, completed_at: new Date().toISOString() }).eq("id", jobId);
    await auth.supabase.from("content_sources").update({ last_error: message }).eq("id", source.id);
    return apiError("CONTENT_INGEST_FAILED", "无法安全读取该官方来源，请检查链接或改为人工录入。", 400, traceId);
  }
}
