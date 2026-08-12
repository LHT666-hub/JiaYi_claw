import { createHash } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/db/audit";
import { assertSafeOfficialUrl } from "@/lib/security/safeUrl";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({ sourceId: z.string().uuid(), url: z.string().url(), category: z.enum(["notice", "activity", "health_classroom", "schedule_notice", "policy"]) });

function parsePublishedAt(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = normalized.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanPageTitle(value: string) {
  return value
    .replace(/_(关注民生|公告栏|医疗服务|通知公告)$/u, "")
    .replace(/\s*[-_|]\s*(上海奉贤|上海市奉贤区人民政府)$/u, "")
    .trim();
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || auth.profile?.role !== "admin") return apiError("FORBIDDEN", "只有管理员可以采集内容。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INGEST_REQUEST", "采集参数无效。", 400, traceId);
  const { data: source } = await auth.supabase.from("content_sources").select("*").eq("id", parsed.data.sourceId).eq("organization_id", auth.profile.organization_id).eq("active", true).maybeSingle();
  if (!source) return apiError("CONTENT_SOURCE_NOT_FOUND", "来源不存在或已停用。", 404, traceId);
  if (!["official_website", "wechat_article"].includes(source.source_type)) {
    return apiError("CONTENT_SOURCE_MODE_UNSUPPORTED", "该来源类型不能使用文章 URL 采集，请使用对应的结构化导入方式。", 400, traceId);
  }
  let jobId: string | null = null;
  try {
    const target = await assertSafeOfficialUrl(parsed.data.url, source.allowed_host);
    const registeredUrl = new URL(source.source_url);
    registeredUrl.hash = "";
    target.hash = "";
    const comparable = (url: URL) => {
      const copy = new URL(url);
      ["chksm", "scene", "clicktime", "enterid", "from", "isappinstalled", "sessionid", "subscene"].forEach((key) => copy.searchParams.delete(key));
      copy.searchParams.sort();
      return copy.toString();
    };
    if (source.source_type === "wechat_article") {
      const registeredPublisher = registeredUrl.searchParams.get("__biz");
      const targetPublisher = target.searchParams.get("__biz");
      if (registeredPublisher && targetPublisher ? registeredPublisher !== targetPublisher : comparable(target) !== comparable(registeredUrl)) {
        throw new Error("WECHAT_ARTICLE_SOURCE_MISMATCH");
      }
    }
    const { data: job } = await auth.supabase.from("ingestion_jobs").insert({ source_id: source.id, requested_by: auth.profile.id, target_url: target.toString(), status: "processing", started_at: new Date().toISOString() }).select("id").single();
    jobId = job?.id ?? null;
    const response = await fetch(target, { headers: { "User-Agent": "JiayiClawContentReview/1.0" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error("SOURCE_DOCUMENT_TOO_LARGE");
    const $ = load(html);
    const meta = (property: string) => $(`meta[property='${property}']`).attr("content")?.trim() || $(`meta[name='${property}']`).attr("content")?.trim() || "";
    const title = cleanPageTitle(meta("og:title") || $("title").first().text()).slice(0, 200);
    const metadataSummary = (meta("og:description") || meta("description")).replace(/\s+/g, " ").trim();
    const paragraphSummary = $("p").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get()
      .filter((text) => text.length >= 24 && !/^(来源|作者|编辑|责任编辑)[：:]/.test(text))
      .slice(0, 2)
      .join(" ");
    const summary = (metadataSummary.length >= 50 ? metadataSummary : paragraphSummary || metadataSummary).slice(0, 800);
    if (!title || summary.length < 10) throw new Error("SOURCE_METADATA_INCOMPLETE");
    const cover = meta("og:image");
    const pageDate = $("time,[class*='time'],[class*='date']").map((_, element) => $(element).text().trim()).get().find((text) => /20\d{2}.?\d{1,2}.?\d{1,2}/.test(text)) ?? "";
    const publishedAt = parsePublishedAt(meta("article:published_time") || meta("publishdate") || meta("pubdate") || pageDate);
    const hash = createHash("sha256").update(`${target}\n${title}\n${summary}`).digest("hex");
    const { data: existing } = await auth.supabase.from("content_items")
      .select("*")
      .eq("organization_id", auth.profile.organization_id)
      .eq("original_url", target.toString())
      .maybeSingle();
    if (existing?.content_hash === hash && existing.status === "published") {
      const scopeUpdate = {
        source_id: source.id,
        community_id: source.community_id,
        institution_id: source.institution_id,
        source_name: source.name,
      };
      const { data: scopedItem, error: scopeError } = await auth.supabase.from("content_items")
        .update(scopeUpdate)
        .eq("id", existing.id)
        .eq("organization_id", auth.profile.organization_id)
        .select("*")
        .single();
      if (scopeError) throw scopeError;
      if (jobId) await auth.supabase.from("ingestion_jobs").update({ status: "completed", items_found: 0, completed_at: new Date().toISOString() }).eq("id", jobId);
      await auth.supabase.from("content_sources").update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
      return apiOk({ item: scopedItem, requiresReview: false, unchanged: true }, traceId);
    }
    if (existing && existing.content_hash !== hash) {
      const { error: revisionError } = await auth.supabase.from("content_item_revisions").upsert({
        content_item_id: existing.id,
        organization_id: existing.organization_id,
        community_id: existing.community_id,
        content_hash: existing.content_hash,
        title: existing.title,
        summary: existing.summary,
        cover_url: existing.cover_url,
        published_at: existing.published_at,
        status: existing.status,
        captured_by: auth.profile.id,
      }, { onConflict: "content_item_id,content_hash", ignoreDuplicates: true });
      if (revisionError) throw revisionError;
    }
    const { data, error } = await auth.supabase.from("content_items").upsert({ organization_id: auth.profile.organization_id, community_id: source.community_id, institution_id: source.institution_id, source_id: source.id, category: parsed.data.category, title, summary, cover_url: cover && /^https:\/\//.test(cover) ? cover : null, original_url: target.toString(), source_name: source.name, published_at: publishedAt, status: "candidate", ingestion_method: "url_import", content_hash: hash, expires_at: null, reviewed_at: null, reviewed_by: null, review_note: null }, { onConflict: "organization_id,original_url" }).select("*").single();
    if (error) throw error;
    if (jobId) await auth.supabase.from("ingestion_jobs").update({ status: "completed", items_found: 1, completed_at: new Date().toISOString() }).eq("id", jobId);
    await auth.supabase.from("content_sources").update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
    await writeAuditLog({ actorId: auth.profile.id, action: "content.ingested", targetTable: "content_items", targetId: data.id, detail: { traceId, sourceId: source.id, category: parsed.data.category }, supabase: auth.supabase });
    return apiOk({ item: data, requiresReview: true }, traceId, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "INGEST_FAILED";
    if (jobId) await auth.supabase.from("ingestion_jobs").update({ status: "failed", last_error: message, completed_at: new Date().toISOString() }).eq("id", jobId);
    await auth.supabase.from("content_sources").update({ last_error: message }).eq("id", source.id);
    return apiError("CONTENT_INGEST_FAILED", "无法安全读取该官方来源，请检查链接或改为人工录入。", 400, traceId);
  }
}
