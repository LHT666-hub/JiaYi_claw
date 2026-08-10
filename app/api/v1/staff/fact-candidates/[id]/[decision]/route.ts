import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { canAccessWorkbench, getApiAuthContext } from "@/lib/supabase/server-auth";

const bodySchema = z.object({ structuredValue: z.record(z.string(), z.unknown()).nullable().optional() });
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; decision: string }> }) {
  const traceId = createTraceId(); const { id, decision } = await context.params;
  if (!z.string().uuid().safeParse(id).success || !["confirm", "reject"].includes(decision)) return apiError("INVALID_FACT_ACTION", "候选事实操作无效。", 400, traceId);
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || !auth.profile || !canAccessWorkbench(auth.profile.role)) return apiError("FORBIDDEN", "没有候选事实审核权限。", 403, traceId);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("INVALID_FACT_VALUE", "结构化事实格式无效。", 400, traceId);
  const { data, error } = await auth.supabase.rpc("review_fact_candidate", { p_candidate_id: id, p_decision: decision === "confirm" ? "confirmed" : "rejected", p_structured_value: parsed.data.structuredValue ?? null });
  return error ? apiError("FACT_REVIEW_FAILED", error.message, 400, traceId) : apiOk({ candidate: data }, traceId);
}
