import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { adminShowcaseAudit } from "@/lib/showcase/admin";

const querySchema = z.object({
  action: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !auth.supabase) return apiOk(adminShowcaseAudit, traceId);
  if (!auth.supabase || auth.profile?.role !== "admin" || !auth.profile.organization_id) {
    return apiError("FORBIDDEN", "只有管理员可以查看审计日志。", 403, traceId);
  }
  const parsed = querySchema.safeParse({
    action: request.nextUrl.searchParams.get("action") || undefined,
    limit: request.nextUrl.searchParams.get("limit") || undefined,
  });
  if (!parsed.success) return apiError("INVALID_AUDIT_QUERY", "审计查询参数无效。", 400, traceId);

  let query = auth.supabase
    .from("audit_logs")
    .select("id,actor_id,action,target_table,target_id,detail,created_at,organization_id,community_id")
    .eq("organization_id", auth.profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);
  if (parsed.data.action) query = query.ilike("action", `%${parsed.data.action.replace(/%/g, "")}%`);
  const { data: logs, error } = await query;
  if (error) return apiError("AUDIT_LIST_FAILED", error.message, 500, traceId);

  const actorIds = [...new Set((logs ?? []).map((item) => item.actor_id).filter(Boolean))];
  const actorsResult = actorIds.length
    ? await auth.supabase.from("profiles").select("id,display_name,role").in("id", actorIds)
    : { data: [], error: null };
  if (actorsResult.error) return apiError("AUDIT_ACTOR_LIST_FAILED", actorsResult.error.message, 500, traceId);
  const actors = new Map((actorsResult.data ?? []).map((actor) => [actor.id, actor]));

  return apiOk({
    logs: (logs ?? []).map((item) => ({ ...item, actor: item.actor_id ? actors.get(item.actor_id) ?? null : null })),
  }, traceId);
}
