import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

const schema = z.object({ itemId: z.string().uuid(), decision: z.enum(["publish", "reject", "request_changes", "expire"]), note: z.string().trim().max(1000).nullable().default(null), expiresAt: z.string().datetime().nullable().default(null) });

export async function POST(request: NextRequest) {
  const traceId = createTraceId(); const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !["admin", "community"].includes(auth.profile.role)) return apiError("FORBIDDEN", "没有内容审核权限。", 403, traceId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_REVIEW", "审核参数无效。", 400, traceId);
  const status = parsed.data.decision === "publish" ? "published" : parsed.data.decision === "expire" ? "expired" : parsed.data.decision === "reject" ? "rejected" : "in_review";
  const { data, error } = await auth.supabase.from("content_items").update({ status, expires_at: parsed.data.expiresAt, reviewed_at: new Date().toISOString(), reviewed_by: auth.profile.id, review_note: parsed.data.note }).eq("id", parsed.data.itemId).eq("organization_id", auth.profile.organization_id).select("*").maybeSingle();
  if (error) return apiError("CONTENT_REVIEW_FAILED", error.message, 500, traceId);
  if (!data) return apiError("CONTENT_NOT_FOUND", "内容不存在。", 404, traceId);
  await auth.supabase.from("content_reviews").insert({ content_item_id: data.id, reviewer_id: auth.profile.id, decision: parsed.data.decision, note: parsed.data.note });
  return apiOk({ item: data }, traceId);
}
