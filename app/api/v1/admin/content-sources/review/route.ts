import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/db/audit";
import { indexKnowledgeSource } from "@/lib/rag/indexer";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { demoMutation } from "@/lib/showcase/admin";

const schema = z.object({
  itemId: z.string().uuid(),
  decision: z.enum(["publish", "reject", "request_changes", "expire"]),
  note: z.string().trim().max(1000).nullable().default(null),
  expiresAt: z.string().datetime().nullable().default(null),
  title: z.string().trim().min(4).max(200).optional(),
  summary: z.string().trim().min(20).max(800).optional(),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth.supabase) return apiOk(demoMutation({ item: { id: crypto.randomUUID(), status: "published" }, ragIndex: { queued: true } }), traceId);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有内容审核权限。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_REVIEW", "审核参数无效。", 400, traceId);
  if (parsed.data.decision === "publish" && (!parsed.data.expiresAt || new Date(parsed.data.expiresAt) <= new Date())) {
    return apiError("CONTENT_EXPIRY_REQUIRED", "发布内容必须设置未来的失效时间。", 400, traceId);
  }
  const status = parsed.data.decision === "publish" ? "published" : parsed.data.decision === "expire" ? "expired" : parsed.data.decision === "reject" ? "rejected" : "in_review";
  const reviewedAt = new Date().toISOString();
  const { data: existing } = await auth.supabase.from("content_items")
    .select("id,title,summary,published_at")
    .eq("id", parsed.data.itemId)
    .eq("organization_id", auth.profile.organization_id)
    .maybeSingle();
  if (!existing) return apiError("CONTENT_NOT_FOUND", "内容不存在。", 404, traceId);
  const { data, error } = await auth.supabase.from("content_items").update({
    title: parsed.data.title ?? existing.title,
    summary: parsed.data.summary ?? existing.summary,
    status,
    expires_at: parsed.data.expiresAt,
    reviewed_at: reviewedAt,
    reviewed_by: auth.profile.id,
    review_note: parsed.data.note,
    published_at: parsed.data.decision === "publish" ? (existing.published_at ?? reviewedAt) : existing.published_at,
  }).eq("id", parsed.data.itemId).eq("organization_id", auth.profile.organization_id).select("*").maybeSingle();
  if (error) return apiError("CONTENT_REVIEW_FAILED", error.message, 500, traceId);
  if (!data) return apiError("CONTENT_NOT_FOUND", "内容不存在。", 404, traceId);
  await auth.supabase.from("content_reviews").insert({ content_item_id: data.id, reviewer_id: auth.profile.id, decision: parsed.data.decision, note: parsed.data.note });
  await writeAuditLog({
    actorId: auth.profile.id,
    action: `content.${parsed.data.decision}`,
    targetTable: "content_items",
    targetId: data.id,
    detail: {
      traceId,
      expiresAt: parsed.data.expiresAt,
      editorialChanges: {
        title: parsed.data.title !== undefined && parsed.data.title !== existing.title,
        summary: parsed.data.summary !== undefined && parsed.data.summary !== existing.summary,
      },
    },
    supabase: auth.supabase,
  });
  let ragIndex: Record<string, unknown> | null = null;
  if (parsed.data.decision === "publish") {
    try {
      ragIndex = await indexKnowledgeSource({
        supabase: auth.supabase,
        sourceType: "content_item",
        sourceId: data.id,
        actorId: auth.profile.id,
        traceId,
      });
    } catch (indexError) {
      ragIndex = {
        queued: true,
        error: indexError instanceof Error ? indexError.message : "RAG_INDEX_FAILED",
      };
    }
  }
  return apiOk({ item: data, ragIndex }, traceId);
}
